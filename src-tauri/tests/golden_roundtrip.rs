//! 配置主权 golden-file 往返测试。
//!
//! 这些测试锁定「非切换写入路径」与「跨供应商切换」对用户自有配置的保留行为:
//! - 用户在 live 配置文件上手改的内容(未知键、注释、插件状态)在任何
//!   cc-switch 触发的重写后都必须存活;
//! - 切换供应商时,与供应商无关的用户键应被带到新供应商的 live(差集回补)。
//!
//! 相关问题:上游 #370(切换丢插件配置)、#5891(重启重置插件状态)。

mod support;

use serde_json::json;

use cc_switch_lib::{
    get_claude_settings_path, get_codex_config_path, get_grok_config_path, read_json_file,
    write_codex_live_atomic, AppType, McpService, MultiAppConfig, Provider, ProviderService,
};

use support::{create_test_state_with_config, ensure_test_home, reset_test_fs, test_mutex};

/// 场景一(Claude):用户在 live settings.json 上加了与供应商无关的键
/// (statusLine / permissions / 自定义开关),随后任何触发 live 重写的操作
/// (共享片段修改、MCP 变更后的重投影等)都不能丢掉它们。
#[test]
fn sync_claude_preserves_live_only_user_keys() {
    let _guard = test_mutex().lock().expect("test mutex");
    reset_test_fs();
    let _home = ensure_test_home();

    // 快照里只有 env;用户后来在 live 上加了 statusLine / permissions / tips
    let mut config = MultiAppConfig::default();
    {
        let manager = config.get_manager_mut(&AppType::Claude).expect("manager");
        manager.current = "p1".into();
        manager.providers.insert(
            "p1".into(),
            Provider::with_id(
                "p1".into(),
                "P1".into(),
                json!({
                    "env": {
                        "ANTHROPIC_BASE_URL": "https://p1.example.com",
                        "ANTHROPIC_AUTH_TOKEN": "p1-key"
                    }
                }),
                None,
            ),
        );
    }
    let state = create_test_state_with_config(&config).expect("state");

    let settings_path = get_claude_settings_path();
    if let Some(parent) = settings_path.parent() {
        std::fs::create_dir_all(parent).expect("create dir");
    }
    std::fs::write(
        &settings_path,
        serde_json::to_string_pretty(&json!({
            "env": {
                "ANTHROPIC_BASE_URL": "https://p1.example.com",
                "ANTHROPIC_AUTH_TOKEN": "p1-key"
            },
            "permissions": { "allow": ["Bash(ls:*)"] },
            "statusLine": { "type": "command", "command": "~/.cc/statusline.sh" },
            "spinnerTipsEnabled": false
        }))
        .expect("serialize"),
    )
    .expect("seed live");

    ProviderService::sync_current_provider_for_app(&state, AppType::Claude)
        .expect("sync should succeed");

    let live: serde_json::Value = read_json_file(&settings_path).expect("read live");
    assert_eq!(
        live.pointer("/env/ANTHROPIC_BASE_URL").and_then(|v| v.as_str()),
        Some("https://p1.example.com"),
        "env 仍由快照提供"
    );
    assert!(
        live.get("permissions").is_some(),
        "用户手改的 permissions 不能被重写丢失:\n{live}"
    );
    assert!(
        live.get("statusLine").is_some(),
        "用户手改的 statusLine 不能被重写丢失:\n{live}"
    );
    assert_eq!(
        live.get("spinnerTipsEnabled").and_then(|v| v.as_bool()),
        Some(false),
        "用户手改的布尔开关不能被重置:\n{live}"
    );
}

/// 场景二(Codex):用户在 live config.toml 上加了 [projects] 信任配置与注释,
/// 非切换重写(如片段修改触发的重投影)必须保留它们。
#[test]
fn sync_codex_preserves_live_only_user_sections_and_comments() {
    let _guard = test_mutex().lock().expect("test mutex");
    reset_test_fs();
    support::enable_codex_official_auth_preservation();
    let _home = ensure_test_home();

    let mut config = MultiAppConfig::default();
    {
        let manager = config.get_manager_mut(&AppType::Codex).expect("manager");
        manager.current = "p1".into();
        manager.providers.insert(
            "p1".into(),
            Provider::with_id(
                "p1".into(),
                "P1".into(),
                json!({
                    "auth": { "OPENAI_API_KEY": "p1-key" },
                    "config": "model_provider = \"p1\"\nmodel = \"gpt-5\"\n\n[model_providers.p1]\nname = \"P1\"\nbase_url = \"https://p1.example.com/v1\"\nwire_api = \"responses\"\n"
                }),
                None,
            ),
        );
    }
    let state = create_test_state_with_config(&config).expect("state");

    // live 上:快照内容 + 用户注释 + 用户 [projects] 段
    write_codex_live_atomic(
        &json!({ "OPENAI_API_KEY": "p1-key" }),
        Some(
            r#"model_provider = "p1"
model = "gpt-5"

# user-managed comment must survive rewrites
[projects."/home/user/repo"]
trust_level = "trusted"

[model_providers.p1]
name = "P1"
base_url = "https://p1.example.com/v1"
wire_api = "responses"
"#,
        ),
    )
    .expect("seed codex live");

    ProviderService::sync_current_provider_for_app(&state, AppType::Codex)
        .expect("sync should succeed");

    let written = std::fs::read_to_string(get_codex_config_path()).expect("read config.toml");
    assert!(
        written.contains("user-managed comment"),
        "用户注释不能被重写丢弃:\n{written}"
    );
    assert!(
        written.contains("[projects.\"/home/user/repo\"]"),
        "用户 projects 信任配置不能被重写丢弃:\n{written}"
    );
    let parsed: toml::Value = toml::from_str(&written).expect("parse written config");
    assert_eq!(
        parsed.get("model_provider").and_then(|v| v.as_str()),
        Some("p1"),
        "快照键仍由供应商提供:\n{written}"
    );
}

/// 场景三(Grok Build):同场景二,TOML 全文覆写路径。
#[test]
fn sync_grok_preserves_live_only_user_sections() {
    let _guard = test_mutex().lock().expect("test mutex");
    reset_test_fs();
    let _home = ensure_test_home();

    let grok_shape = |base_extra: &str| {
        format!(
            r#"[models]
default = "grok-4.5"

{base_extra}[model."grok-4.5"]
model = "grok-4.5"
base_url = "https://p1.example.com/v1"
name = "P1"
api_key = "p1-key"
api_backend = "responses"
context_window = 500000
"#
        )
    };

    let mut config = MultiAppConfig::default();
    {
        let manager = config
            .get_manager_mut(&AppType::GrokBuild)
            .expect("manager");
        manager.current = "p1".into();
        manager.providers.insert(
            "p1".into(),
            Provider::with_id(
                "p1".into(),
                "P1".into(),
                json!({ "config": grok_shape("") }),
                None,
            ),
        );
    }
    let state = create_test_state_with_config(&config).expect("state");

    let grok_path = get_grok_config_path();
    if let Some(parent) = grok_path.parent() {
        std::fs::create_dir_all(parent).expect("create grok dir");
    }
    std::fs::write(
        &grok_path,
        grok_shape(
            r#"# user preference
notify = ["agent-turn-complete"]

"#,
        ),
    )
    .expect("seed grok live");

    ProviderService::sync_current_provider_for_app(&state, AppType::GrokBuild)
        .expect("sync should succeed");

    let written = std::fs::read_to_string(&grok_path).expect("read grok config.toml");
    assert!(
        written.contains("user preference"),
        "用户注释不能被重写丢弃:\n{written}"
    );
    assert!(
        written.contains("notify = [\"agent-turn-complete\"]"),
        "用户 notify 偏好不能被重写丢弃:\n{written}"
    );
}

/// 场景四(切换 + 差集回补):Claude 切换供应商时,与供应商无关的用户键
/// (permissions / statusLine)必须跟随 live 传给新供应商——这正是上游
/// #370「切换后插件配置丢失」的问题类别。
#[test]
fn switch_claude_carries_user_keys_to_new_provider() {
    let _guard = test_mutex().lock().expect("test mutex");
    reset_test_fs();
    let _home = ensure_test_home();

    let mut config = MultiAppConfig::default();
    {
        let manager = config.get_manager_mut(&AppType::Claude).expect("manager");
        manager.current = "old".into();
        manager.providers.insert(
            "old".into(),
            Provider::with_id(
                "old".into(),
                "Old".into(),
                json!({
                    "env": {
                        "ANTHROPIC_BASE_URL": "https://old.example.com",
                        "ANTHROPIC_AUTH_TOKEN": "old-key"
                    }
                }),
                None,
            ),
        );
        manager.providers.insert(
            "new".into(),
            Provider::with_id(
                "new".into(),
                "New".into(),
                json!({
                    "env": {
                        "ANTHROPIC_BASE_URL": "https://new.example.com",
                        "ANTHROPIC_AUTH_TOKEN": "new-key"
                    }
                }),
                None,
            ),
        );
    }
    let state = create_test_state_with_config(&config).expect("state");

    let settings_path = get_claude_settings_path();
    if let Some(parent) = settings_path.parent() {
        std::fs::create_dir_all(parent).expect("create dir");
    }
    std::fs::write(
        &settings_path,
        serde_json::to_string_pretty(&json!({
            "env": {
                "ANTHROPIC_BASE_URL": "https://old.example.com",
                "ANTHROPIC_AUTH_TOKEN": "old-key"
            },
            "permissions": { "allow": ["WebFetch"] },
            "statusLine": { "type": "command", "command": "echo hi" }
        }))
        .expect("serialize"),
    )
    .expect("seed live");

    ProviderService::switch(&state, AppType::Claude, "new").expect("switch");

    let live: serde_json::Value = read_json_file(&settings_path).expect("read live");
    assert_eq!(
        live.pointer("/env/ANTHROPIC_BASE_URL").and_then(|v| v.as_str()),
        Some("https://new.example.com"),
        "env 已切到新供应商"
    );
    assert!(
        live.get("permissions").is_some(),
        "切换不能丢掉用户的 permissions(差集回补):\n{live}"
    );
    assert!(
        live.get("statusLine").is_some(),
        "切换不能丢掉用户的 statusLine(差集回补):\n{live}"
    );
}

/// 场景五(Codex MCP 重投影):已知安全路径的行为锁定——MCP 开关只动
/// [mcp_servers] 表,用户注释与其他段必须原样保留。
#[test]
fn codex_mcp_sync_preserves_unrelated_sections() {
    let _guard = test_mutex().lock().expect("test mutex");
    reset_test_fs();
    let _home = ensure_test_home();

    let state = support::create_test_state().expect("state");

    write_codex_live_atomic(
        &json!({ "OPENAI_API_KEY": "k" }),
        Some(
            r#"# top-level user comment
model = "gpt-5"

[projects."/home/user/repo"]
trust_level = "trusted"

[mcp_servers.old-one]
type = "stdio"
command = "echo"
"#,
        ),
    )
    .expect("seed codex live");

    // MCP 库为空 → 重投影会移除 old-one,但不许碰其他内容
    McpService::sync_enabled_for_app(&state, &AppType::Codex).expect("mcp sync");

    let written = std::fs::read_to_string(get_codex_config_path()).expect("read config.toml");
    assert!(
        written.contains("top-level user comment"),
        "MCP 重投影不能丢用户注释:\n{written}"
    );
    assert!(
        written.contains("[projects.\"/home/user/repo\"]"),
        "MCP 重投影不能丢 projects 段:\n{written}"
    );
    assert!(
        written.contains("old-one"),
        "cc-switch 数据库里不存在的 MCP 服务器属于用户自有配置,重投影不得删除:\n{written}"
    );
}
