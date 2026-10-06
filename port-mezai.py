import os
import re

TMP = os.environ['TEMP']
APPS = ['claude', 'claudeDesktop', 'codex', 'gemini', 'grokBuild',
        'hermes', 'openclaw', 'opencode']

# ---------- 1) icon registration ----------
idx = open('src/icons/extracted/index.ts', encoding='utf-8').read()
fork_idx = open(os.path.join(TMP, 'fork-icons.ts'), encoding='utf-8').read()
m = re.search(r'  mezai: `[^`]+`,\n', fork_idx)
assert m, 'fork mezai icon'
if 'mezai:' not in idx:
    anchor_txt = 'export const icons: Record<string, string> = {\n'
    assert idx.count(anchor_txt) == 1
    idx = idx.replace(anchor_txt, anchor_txt + m.group(0), 1)
    open('src/icons/extracted/index.ts', 'w', encoding='utf-8', newline='').write(idx)
print('icon registered (idempotent)')

meta = open('src/icons/extracted/metadata.ts', encoding='utf-8').read()
fork_meta = open(os.path.join(TMP, 'fork-icons-meta.ts'), encoding='utf-8').read()
mm = re.search(r'  mezai: \{[^}]*\},\n', fork_meta)
assert mm, 'fork mezai metadata'
if 'mezai:' not in meta:
    ma = re.search(r'export const iconMetadata[^=]*= \{\n', meta)
    assert ma
    meta = meta[:ma.end()] + mm.group(0) + meta[ma.end():]
    open('src/icons/extracted/metadata.ts', 'w', encoding='utf-8', newline='').write(meta)
print('metadata registered')

# ---------- 2) pinned field on interfaces ----------
for app in APPS:
    p = f'src/config/{app}ProviderPresets.ts'
    src = open(p, encoding='utf-8').read()
    if 'pinned?: boolean' in src:
        continue
    m = re.search(r'(?m)^  name: string;$', src)
    assert m, f'{app} interface name field'
    src = src[:m.end()] + '\n  pinned?: boolean; // 本地内置渠道，置顶显示' + src[m.end():]
    open(p, 'w', encoding='utf-8', newline='').write(src)
print('pinned fields added')

# ---------- 3) pinned-first sorting ----------
p = 'src/components/providers/forms/presetGroups.ts'
src = open(p, encoding='utf-8').read()
old = '''export function sortPresetsByName(
  entries: PresetEntry[],
  t: Translate,
): PresetEntry[] {
  return sortByName(entries, (entry) => presetDisplayName(entry.preset, t));
}'''
new = '''export function sortPresetsByName(
  entries: PresetEntry[],
  t: Translate,
): PresetEntry[] {
  // 本地内置渠道（pinned）恒排最前，其余按显示名排序
  const pinned = entries.filter((entry) => entry.preset.pinned);
  const rest = entries.filter((entry) => !entry.preset.pinned);
  return [...sortByName(pinned, (e) => presetDisplayName(e.preset, t)),
          ...sortByName(rest, (e) => presetDisplayName(e.preset, t))];
}'''
assert src.count(old) == 1
src = src.replace(old, new, 1)
old2 = '''export function sortPresetRowsByName<T extends { row: PresetRowItem }>(
  items: T[],
  t: Translate,
): T[] {
  return sortByName(items, (item) => presetRowName(item.row, t));
}'''
new2 = '''export function sortPresetRowsByName<T extends { row: PresetRowItem }>(
  items: T[],
  t: Translate,
): T[] {
  const isPinned = (item: T) =>
    (item.row.entries ?? []).some((entry) => entry.preset.pinned) ||
    (item.row as { pinned?: boolean }).pinned === true;
  const pinned = items.filter(isPinned);
  const rest = items.filter((item) => !isPinned(item));
  return [...sortByName(pinned, (item) => presetRowName(item.row, t)),
          ...sortByName(rest, (item) => presetRowName(item.row, t))];
}'''
assert src.count(old2) == 1
src = src.replace(old2, new2, 1)
open(p, 'w', encoding='utf-8', newline='').write(src)
print('sorting pinned-first')

# ---------- 4) codex generateThirdPartyConfig reasoningEffort option ----------
p = 'src/config/codexProviderPresets.ts'
src = open(p, encoding='utf-8').read()
m = re.search(r'export function generateThirdPartyConfig\([\s\S]*?\n\}', src)
assert m, 'generator fn'
fn = m.group(0)
if 'reasoningEffort' not in fn:
    new_fn = fn.replace('): string {', '''  options?: {
    requiresOpenAiAuth?: boolean;
    reasoningEffort?: string;
  },
): string {''', 1)
    # add default + use option
    new_fn = new_fn.replace(
        '  const tomlString =',
        '  const reasoningEffort = options?.reasoningEffort ?? "high";\n  const tomlString =', 1)
    new_fn = re.sub(r'model_reasoning_effort = "high"',
                    'model_reasoning_effort = ${tomlString(reasoningEffort)}',
                    new_fn, count=1)
    src = src.replace(fn, new_fn, 1)
    open(p, 'w', encoding='utf-8', newline='').write(src)
print('generator option added')

# ---------- 5) insert Me-zai entries as first array entry ----------
for app in APPS:
    p = f'src/config/{app}ProviderPresets.ts'
    src = open(p, encoding='utf-8').read()
    if 'name: "Me-zai"' in src:
        print(app, 'already has Me-zai')
        continue
    entry = open(os.path.join(TMP, f'mezai-{app}.txt'), encoding='utf-8').read()
    m = re.search(r'export const \w*[Pp]resets\w*: [^=]+?= \[\n', src)
    assert m, f'{app} array'
    ins = m.end()
    # skip a leading comment block right after `[`? keep it simple: insert before
    # the first entry `{` or comment — safest is right after `[`
    src = src[:ins] + entry + '\n' + src[ins:]
    open(p, 'w', encoding='utf-8', newline='').write(src)
    print(app, 'Me-zai inserted')

print('PORT DONE')
