import { useState } from 'react';
import { SystemPanel } from '../ui/SystemPanel';
import { Button, TOUCH_MIN } from '../ui/Button';
import { T } from '../ui/tokens';
import { clearAiConfig, loadAiConfig, maskKey, saveAiConfig } from '../ai/config';
import { testApiKey } from '../ai/client';

/**
 * AI 유언 설정 — 무덤 '기록' 탭 맨 아래. gdd-v3 §4.10.
 *
 * 무덤에 두는 이유: 유언이 사는 곳이 여기다. 설정 화면을 새로 만들면
 * 마을에 자리를 하나 더 열어야 하는데 마을은 이미 꽉 찼다(CLAUDE.md).
 *
 * **선택 기능이다.** 켜지 않아도 모든 영웅이 템플릿 유언을 남긴다.
 * 문구가 이것을 먼저 말해야 한다 — 안 그러면 "키가 없어서 뭔가 빠졌다"로 읽힌다.
 */
export function AiSettingsPanel() {
  const [cfg, setCfg] = useState(() => loadAiConfig());
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const k = draft.trim();
    if (!k) return;
    setBusy(true);
    setStatus('키를 확인하는 중…');
    const ok = await testApiKey(k);
    setBusy(false);
    if (!ok) {
      setStatus('이 키로는 응답이 오지 않았다. 키를 다시 확인하라.');
      return;
    }
    if (!saveAiConfig({ apiKey: k })) {
      setStatus('이 브라우저에 저장할 수 없다.');
      return;
    }
    setCfg(loadAiConfig());
    setDraft('');
    setStatus('저장했다. 다음 죽음부터 AI가 유언을 쓴다.');
  };

  const remove = () => {
    clearAiConfig();
    setCfg(null);
    setStatus('지웠다. 이제 기본 유언이 남는다.');
  };

  return (
    <SystemPanel compact>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          minHeight: TOUCH_MIN,
          background: 'transparent',
          border: 'none',
          color: T.dim,
          fontFamily: 'inherit',
          fontSize: 12,
          letterSpacing: '.2em',
          cursor: 'pointer',
        }}
      >
        유언을 AI로 쓰기 · {cfg ? <span style={{ color: T.rare }}>켜짐</span> : '꺼짐'} {open ? '▴' : '▾'}
      </button>

      {open && (
        <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.9, padding: '4px 6px 8px', wordBreak: 'keep-all' }}>
          <p style={{ margin: 0 }}>켜지 않아도 모든 영웅은 유언을 남긴다.</p>
          <p style={{ margin: '6px 0 0' }}>
            켜면 AI가 그 영웅이 걸어온 길(합류한 층, 함께 싸운 이들, 생전)을 읽고
            그 사람만의 마지막 말을 쓴다. <span style={{ color: T.rare }}>◇</span> 표시가 붙는다.
          </p>
          <p style={{ margin: '8px 0 0', color: T.amber }}>
            본인의 Anthropic API 키가 필요하고, 쓴 만큼 요금이 나온다.
            키는 이 기기의 브라우저에만 저장된다. 공용 기기에서는 쓰지 말 것.
          </p>

          {cfg ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ color: T.text, marginBottom: 8 }}>저장된 키 {maskKey(cfg.apiKey)}</div>
              <Button small onClick={remove}>키 지우기</Button>
            </div>
          ) : (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="sk-ant-…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                style={{
                  width: '100%',
                  maxWidth: 320,
                  minHeight: TOUCH_MIN,
                  boxSizing: 'border-box',
                  padding: '0 12px',
                  background: T.void,
                  border: `1px solid ${T.panelHi}`,
                  color: T.text,
                  fontFamily: 'inherit',
                  fontSize: 13,
                  textAlign: 'center',
                }}
              />
              <Button small disabled={busy || draft.trim() === ''} onClick={save}>
                {busy ? '확인 중…' : '저장'}
              </Button>
            </div>
          )}
          {status && <div style={{ marginTop: 10, color: T.text }}>{status}</div>}
        </div>
      )}
    </SystemPanel>
  );
}
