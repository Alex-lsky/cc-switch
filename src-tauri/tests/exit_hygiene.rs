//! 代理退出卫生测试:锁定「退出时还原 live、保留代理状态」的行为。
//!
//! 对应 cleanup_before_exit(lib.rs)在正常退出路径调用的
//! `stop_with_restore_keep_state`:用户手动改动过的 live 配置在接管前已被
//! 备份,退出时必须原样还原,且 proxy_config.enabled 保留供下次启动恢复。

mod support;

use serde_json::json;

use cc_switch_lib::{
    get_claude_settings_path, read_json_file, AppType, MultiAppConfig, Provider, ProviderService,
};

use support::{create_test_state_with_config, ensure_test_home, reset_test_fs, test_mutex};

#[tokio::test]
#[allow(clippy::await_holding_lock)]
async fn exit_cleanup_restores_live_and_keeps_proxy_state() {
    let _guard = test_mutex().lock().expect("acquire test mutex");
    reset_test_fs();
    let _home = ensure_test_home();

    let provider_config = json!({
        "env": {
            "ANTHROPIC_AUTH_TOKEN": "exit-key",
            "ANTHROPIC_BASE_URL": "https://exit.example.com"
        }
    });

    let mut config = MultiAppConfig::default();
    {
        let manager = config.get_manager_mut(&AppType::Claude).expect("manager");
        manager.current = "p1".into();
        manager.providers.insert(
            "p1".into(),
            Provider::with_id("p1".into(), "P1".into(), provider_config.clone(), None),
        );
    }
    let state = create_test_state_with_config(&config).expect("state");

    // 用空闲端口,避免与宿主机上运行的应用抢占默认端口
    let free_port = std::net::TcpListener::bind("127.0.0.1:0")
        .expect("bind probe")
        .local_addr()
        .expect("addr")
        .port();
    let mut proxy_config = state
        .db
        .get_proxy_config()
        .await
        .expect("read proxy config");
    proxy_config.listen_port = free_port;
    state
        .db
        .update_proxy_config(proxy_config)
        .await
        .expect("set proxy port");

    // 写入 live(p1 内容)后开启接管
    let settings_path = get_claude_settings_path();
    std::fs::create_dir_all(settings_path.parent().expect("dir")).expect("mkdir");
    std::fs::write(
        &settings_path,
        serde_json::to_string_pretty(&provider_config).expect("serialize"),
    )
    .expect("seed live");

    state
        .proxy_service
        .set_takeover_for_app("claude", true)
        .await
        .expect("enable takeover");

    let taken_over = std::fs::read_to_string(&settings_path).expect("read taken-over live");
    assert!(
        taken_over.contains("127.0.0.1"),
        "接管后 live 应指向本地代理:\n{taken_over}"
    );
    assert!(
        state.db.get_live_backup("claude").await.unwrap().is_some(),
        "接管期间必须存在还原备份"
    );

    // 模拟正常退出路径:还原 live,但保留代理状态
    state
        .proxy_service
        .stop_with_restore_keep_state()
        .await
        .expect("exit cleanup");

    let restored: serde_json::Value = read_json_file(&settings_path).expect("read restored live");
    assert_eq!(
        restored, provider_config,
        "退出清理必须把 live 原样还原为接管前的供应商配置"
    );

    assert!(
        state.db.get_live_backup("claude").await.unwrap().is_none(),
        "live 已还原,备份必须删除"
    );

    let config_after = state
        .db
        .get_proxy_config_for_app("claude")
        .await
        .expect("read proxy config after cleanup");
    assert!(
        config_after.enabled,
        "keep_state 语义:enabled 必须保留,供下次启动自动恢复接管"
    );

    let global_after = state
        .db
        .get_proxy_config()
        .await
        .expect("read global config");
    assert!(
        !global_after.live_takeover_active,
        "退出后 takeover 活动标志必须清除"
    );

    let _ = ProviderService::list(&state, AppType::Claude).expect("service still usable");
}
