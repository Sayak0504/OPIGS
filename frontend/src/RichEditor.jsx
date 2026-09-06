import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import StarterKit from '@tiptap/starter-kit';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import { api } from './api';

const SYMBOLS = ['≤', '≥', '×', '±', '→', '°', 'µ', 'Ω', 'α', 'β', 'λ', '∞', '≈', '≠', '∑', '—'];

const ghostKey = new PluginKey('ghostText');

/* Grey suggestion text drawn at the cursor. Tab accepts, Esc dismisses. */
const GhostText = Extension.create({
  name: 'ghostText',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: ghostKey,
        state: {
          init: () => ({ text: '', pos: null }),
          apply(tr, value) {
            const meta = tr.getMeta(ghostKey);
            if (meta !== undefined) return meta;
            if (tr.docChanged || tr.selectionSet) return { text: '', pos: null };
            return value;
          },
        },
        props: {
          decorations(state) {
            const s = ghostKey.getState(state);
            if (!s || !s.text) return null;
            const span = document.createElement('span');
            span.textContent = s.text;
            span.style.color = '#9CA3AF';
            span.style.pointerEvents = 'none';
            return DecorationSet.create(state.doc, [
              Decoration.widget(s.pos, span, { side: 1 }),
            ]);
          },
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        const s = ghostKey.getState(this.editor.state);
        if (!s?.text) return false;
        this.editor.commands.insertContent(s.text);
        return true;
      },
      Escape: () => {
        const { state, view } = this.editor;
        view.dispatch(state.tr.setMeta(ghostKey, { text: '', pos: null }));
        return true;
      },
    };
  },
});

export default function RichEditor({ value, onChange, disabled }) {
  const [busy, setBusy] = useState(null);
  const [issues, setIssues] = useState([]);
  const [checked, setChecked] = useState(false);
  const [autoOn, setAutoOn] = useState(false);
  const timerRef = useRef(null);

  const editor = useEditor({
    extensions: [StarterKit, Superscript, Subscript, GhostText],
    content: value || '',
    editable: !disabled,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
      if (autoOn) scheduleCompletion(editor);
    },
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || '', false);
    }
  }, [value, editor]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  /* ---------- autocomplete ---------- */

  const scheduleCompletion = (ed) => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      const pos = ed.state.selection.from;
      const before = ed.state.doc.textBetween(0, pos, ' ');
      if (before.trim().length < 15 || before.endsWith(' ') === false) return;

      try {
        const res = await api('/api/ai/autocomplete', {
          method: 'POST',
          body: JSON.stringify({ text: before }),
        });
        if (!res.completion) return;
        const { state, view } = ed;
        view.dispatch(
          state.tr.setMeta(ghostKey, { text: res.completion, pos: state.selection.from })
        );
      } catch {
        /* rate limited or offline — stay quiet */
      }
    }, 1500);
  };

  /* ---------- rephrase on selection ---------- */

  const runPolish = async (action) => {
    const { from, to } = editor.state.selection;
    if (from === to) {
      alert('Select the sentence you want to change first.');
      return;
    }
    const text = editor.state.doc.textBetween(from, to, ' ');

    setBusy(action);
    try {
      const res = await api('/api/ai/polish', {
        method: 'POST',
        body: JSON.stringify({ text, action }),
      });
      editor.chain().focus().insertContentAt({ from, to }, res.text).run();
    } catch (err) {
      alert(err.message);
    }
    setBusy(null);
  };

  /* ---------- grammar check ---------- */

  const runGrammar = async () => {
    setBusy('grammar');
    setChecked(false);
    try {
      const res = await api('/api/ai/grammar', {
        method: 'POST',
        body: JSON.stringify({ text: editor.getText() }),
      });
      setIssues(res.issues || []);
      setChecked(true);
    } catch (err) {
      alert(err.message);
    }
    setBusy(null);
  };

  const applyIssue = (issue) => {
    let found = null;
    editor.state.doc.descendants((node, pos) => {
      if (found || !node.isText) return;
      const idx = node.text.indexOf(issue.original);
      if (idx !== -1) found = { from: pos + idx, to: pos + idx + issue.original.length };
    });

    if (!found) {
      alert('Could not find that text any more — it may have been edited.');
      return;
    }

    editor.chain().focus().insertContentAt(found, issue.suggestion).run();
    setIssues(issues.filter((i) => i !== issue));
  };

  if (!editor) return null;

  const Btn = ({ onClick, active, title, children, wide }) => (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled || busy !== null}
      style={{
        minWidth: wide ? 'auto' : '30px', height: '28px', padding: '0 8px',
        backgroundColor: active ? '#4F46E5' : '#ffffff',
        color: active ? '#ffffff' : '#374151',
        border: '1px solid #D1D5DB', borderRadius: '4px',
        cursor: disabled || busy ? 'not-allowed' : 'pointer', fontSize: '13px',
      }}>
      {children}
    </button>
  );

  const TYPE_COLOR = { spelling: '#DC2626', grammar: '#D97706', style: '#2563EB' };

  return (
    <div>
      <div style={{ border: '1px solid #D1D5DB', borderRadius: '6px', overflow: 'hidden', backgroundColor: disabled ? '#E5E7EB' : '#ffffff' }}>

        {/* formatting row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', padding: '6px', backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
          <Btn title="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><strong>B</strong></Btn>
          <Btn title="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><em>I</em></Btn>
          <Btn wide title="Bullet list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>• List</Btn>
          <Btn wide title="Numbered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. List</Btn>
          <Btn title="Superscript" active={editor.isActive('superscript')} onClick={() => editor.chain().focus().toggleSuperscript().run()}>x²</Btn>
          <Btn title="Subscript" active={editor.isActive('subscript')} onClick={() => editor.chain().focus().toggleSubscript().run()}>x₂</Btn>

          <span style={{ width: '1px', backgroundColor: '#D1D5DB', margin: '0 4px' }} />

          {SYMBOLS.map((s) => (
            <Btn key={s} title={`Insert ${s}`} onClick={() => editor.chain().focus().insertContent(s).run()}>{s}</Btn>
          ))}
        </div>

        {/* AI row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', padding: '6px 8px', backgroundColor: '#F5F3FF', borderBottom: '1px solid #E5E7EB' }}>
          <span style={{ fontSize: '12px', color: '#6B7280' }}>On selection:</span>
          <Btn wide title="Rewrite more clearly" onClick={() => runPolish('rephrase')}>{busy === 'rephrase' ? '...' : '✨ Rephrase'}</Btn>
          <Btn wide title="Make it shorter" onClick={() => runPolish('shorten')}>{busy === 'shorten' ? '...' : '✂ Shorten'}</Btn>
          <Btn wide title="Lead with an action verb" onClick={() => runPolish('impact')}>{busy === 'impact' ? '...' : '⚡ Stronger'}</Btn>

          <span style={{ width: '1px', backgroundColor: '#DDD6FE', margin: '0 3px', alignSelf: 'stretch' }} />

          <Btn wide title="Check spelling, grammar and style" onClick={runGrammar}>{busy === 'grammar' ? 'Checking...' : '🔍 Check writing'}</Btn>

          <label style={{ marginLeft: 'auto', fontSize: '12px', color: '#6B7280', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
            <input type="checkbox" checked={autoOn} onChange={(e) => setAutoOn(e.target.checked)} disabled={disabled} />
            Autocomplete (Tab)
          </label>
        </div>

        <EditorContent editor={editor} style={{ padding: '10px 12px', minHeight: '130px', fontSize: '14px', color: '#111827' }} />
      </div>

      {/* grammar results */}
      {checked && issues.length === 0 && (
        <div style={{ marginTop: '8px', padding: '10px 12px', backgroundColor: '#ECFDF5', color: '#065F46', borderRadius: '6px', fontSize: '13px', border: '1px solid #A7F3D0' }}>
          ✓ No issues found.
        </div>
      )}

      {issues.length > 0 && (
        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '12px', color: '#6B7280' }}>{issues.length} suggestion{issues.length > 1 ? 's' : ''}</div>

          {issues.map((issue, i) => (
            <div key={i} style={{ padding: '10px 12px', backgroundColor: '#ffffff', border: '1px solid #E5E7EB', borderLeft: `4px solid ${TYPE_COLOR[issue.type] || '#6B7280'}`, borderRadius: '6px' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.4px', color: TYPE_COLOR[issue.type] || '#6B7280', fontWeight: '700' }}>
                {issue.type}
              </div>
              <div style={{ fontSize: '13px', margin: '5px 0', color: '#111827' }}>
                <span style={{ textDecoration: 'line-through', color: '#9CA3AF' }}>{issue.original}</span>
                {'  →  '}
                <strong>{issue.suggestion}</strong>
              </div>
              <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '8px' }}>{issue.reason}</div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => applyIssue(issue)} disabled={disabled}
                  style={{ padding: '4px 12px', fontSize: '12px', backgroundColor: '#4F46E5', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600' }}>
                  Apply
                </button>
                <button onClick={() => setIssues(issues.filter((x) => x !== issue))}
                  style={{ padding: '4px 12px', fontSize: '12px', backgroundColor: '#F3F4F6', color: '#6B7280', border: '1px solid #D1D5DB', borderRadius: '4px', cursor: 'pointer' }}>
                  Ignore
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .ProseMirror { outline: none; min-height: 110px; }
        .ProseMirror ul, .ProseMirror ol { padding-left: 22px; margin: 4px 0; }
        .ProseMirror p { margin: 4px 0; }
        .ProseMirror p.is-editor-empty:first-child::before {
          content: 'Write your project description. Use the toolbar for bullets and formatting.';
          color: #9CA3AF; float: left; height: 0; pointer-events: none;
        }
      `}</style>
    </div>
  );
}