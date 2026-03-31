#!/usr/bin/env python3
"""Apply all remaining App.tsx edits for StudioAI Stripe integration"""
import re

with open('/Users/camillebrown/studioai/App.tsx', 'r') as f:
    content = f.read()

# 1. Remove handleSaveApiKey function (lines ~340-354)
content = re.sub(
    r'  const handleSaveApiKey = \(\) => \{.*?\n  \};\n',
    '',
    content,
    flags=re.DOTALL
)

# 2. Remove refreshProKeyStatus function
content = re.sub(
    r'  const refreshProKeyStatus = useCallback\(async \(\) => \{.*?\}, \[\]\);\n',
    '',
    content,
    flags=re.DOTALL
)

# 3. Remove refreshProKeyStatus useEffect
content = re.sub(
    r'  useEffect\(\(\) => \{\n    if \(originalImage\) refreshProKeyStatus\(\);\n  \}, \[originalImage, refreshProKeyStatus\]\);\n',
    '',
    content
)


# 4. Remove the showKeyPrompt modal (huge block)
content = re.sub(
    r'      \{showKeyPrompt && \(\n.*?\n      \)\}\n',
    '',
    content,
    flags=re.DOTALL
)

# 5. Remove the showProConfirm modal
content = re.sub(
    r'      \{showProConfirm && \(\n.*?Confirm and Enhance\n.*?\n      \)\}\n',
    '',
    content,
    flags=re.DOTALL
)

# 6. Replace the Enhance button block with nothing (keep Export and Save)
content = re.sub(
    r'                <button\n                  type="button"\n                  onClick=\{\(\) => \{\n                    if \(hasProKey\).*?Unlock Enhance.*?\n                </button>\n',
    '',
    content,
    flags=re.DOTALL
)

# 7. Replace API Key buttons with upgrade/Pro badge
api_key_button_pattern = r'''            <button\n              type="button"\n              onClick=\{\(\) => \{ setApiKeyInput.*?Add Key.*?</button>'''
content = re.sub(
    api_key_button_pattern,
    '''            {subscription.plan === 'free' ? (
              <button
                type="button"
                onClick={() => setShowUpgradeModal(true)}
                className="rounded-lg px-2.5 py-1.5 text-xs font-bold inline-flex items-center gap-1.5 transition bg-gradient-to-r from-[var(--color-primary)] to-blue-400 text-black hover:opacity-90"
              >
                <Crown size={12} />
                <span className="hidden sm:inline">Upgrade</span>
              </button>
            ) : (
              <span className="rounded-lg px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest inline-flex items-center gap-1.5 bg-[rgba(10,132,255,0.15)] text-[var(--color-primary)] border border-[rgba(10,132,255,0.3)]">
                <Crown size={11} />
                Pro
              </span>
            )}''',
    content,
    flags=re.DOTALL
)


# 8. Fix handleGenerate calls - remove ", false" second arg
content = content.replace('handleGenerate(p, false)', 'handleGenerate(p)')
content = content.replace("handleGenerate(editMatch[1], false)", "handleGenerate(editMatch[1])")

# 9. Replace onRequireKey with upgrade modal
content = content.replace(
    "onRequireKey={() => setShowKeyPrompt(true)}",
    "onRequireKey={() => setShowUpgradeModal(true)}"
)

# 10. Add upgrade modal before showAccessPanel
upgrade_modal = '''      {showUpgradeModal && (
        <div className="fixed inset-0 z-[100] grid place-items-center modal-overlay p-4 animate-fade-in">
          <div className="modal-panel w-full max-w-md rounded-2xl p-8 animate-scale-in">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[rgba(10,132,255,0.15)] text-[var(--color-primary)]">
                  <Crown size={22} />
                </div>
                <div>
                  <h2 className="font-display text-xl font-bold text-white">Upgrade to Pro</h2>
                  <p className="text-xs text-zinc-400">Unlimited AI generations</p>
                </div>
              </div>
              <button type="button" onClick={() => setShowUpgradeModal(false)} className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-[var(--color-bg)]">
                <X size={16} />
              </button>
            </div>
            <div className="mb-6 rounded-xl border border-[rgba(10,132,255,0.3)] bg-[rgba(10,132,255,0.08)] p-4">
              <div className="flex items-baseline gap-1 mb-3">
                <span className="text-3xl font-black text-white">$29</span>
                <span className="text-sm text-zinc-400">/month</span>
              </div>
            </div>
            <button type="button" onClick={() => { setShowUpgradeModal(false); subscription.startCheckout(googleUser?.sub || ''); }} className="cta-primary w-full rounded-xl py-3.5 text-sm font-bold flex items-center justify-center gap-2">
              <CreditCard size={16} /> Start Pro Plan
            </button>
            <p className="mt-3 text-center text-[10px] text-zinc-500">Cancel anytime. Powered by Stripe.</p>
          </div>
        </div>
      )}

'''
if '{showUpgradeModal' not in content:
    content = content.replace(
        '      {showAccessPanel && (',
        upgrade_modal + '      {showAccessPanel && ('
    )

with open('/Users/camillebrown/studioai/App.tsx', 'w') as f:
    f.write(content)

print("Done! All edits applied.")
