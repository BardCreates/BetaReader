"use client";

import { Extension } from "@tiptap/react";
import { Placeholder } from "@tiptap/extensions";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { findQuote } from "@/lib/manuscript/anchor";
import { plainRangeToPos, serializeDoc, type DocNode } from "@/lib/manuscript/doc";

export type HighlightNote = {
  id: string;
  kind: "REACTION" | "PRAISE" | "ISSUE";
  quote: string;
  hint: number;
  dim: boolean;
};

export type ChapterEditorHandle = {
  /** Scroll a note's highlighted passage into view. */
  revealNote: (id: string) => void;
  /** The document as it is in the editor right now. */
  getDoc: () => DocNode | null;
  setSuggestions: (list: Suggestion[]) => void;
  acceptSuggestion: (id: string, replacement: string) => void;
  dismissSuggestion: (id: string) => void;
  revealSuggestion: (id: string) => void;
};

// ─── Highlights that follow the author's edits ───────────────────

const highlightKey = new PluginKey<DecorationSet>("noteHighlights");

/** Find each note's passage in the current text and turn it into an inline decoration. */
function buildHighlights(doc: PMNode, notes: HighlightNote[]) {
  const { text, posAt } = serializeDoc(doc.toJSON() as DocNode);
  const found = new Set<string>();
  const decos: Decoration[] = [];
  for (const n of notes) {
    const a = findQuote(text, n.quote, n.hint);
    const r = a && plainRangeToPos(posAt, a.start, a.end);
    if (!r) continue;
    found.add(n.id);
    decos.push(
      Decoration.inline(
        r.from,
        r.to,
        {
          nodeName: "mark",
          class: "note",
          "data-note": n.id,
          "data-kind": n.kind,
          "data-dim": String(n.dim),
        },
        { id: n.id },
      ),
    );
  }
  return { set: DecorationSet.create(doc, decos), found };
}

function NoteHighlights(onAnchors: (found: Set<string>) => void) {
  return Extension.create({
    name: "noteHighlights",
    addProseMirrorPlugins() {
      return [
        new Plugin<DecorationSet>({
          key: highlightKey,
          state: {
            init: (_, state) => DecorationSet.create(state.doc, []),
            apply(tr, old) {
              const notes = tr.getMeta(highlightKey) as HighlightNote[] | undefined;
              if (notes) {
                const { set, found } = buildHighlights(tr.doc, notes);
                queueMicrotask(() => onAnchors(found));
                return set;
              }
              // While typing, move existing highlights along with the text.
              return tr.docChanged ? old.map(tr.mapping, tr.doc) : old;
            },
          },
          props: {
            decorations: (state) => highlightKey.getState(state),
          },
        }),
      ];
    },
  });
}

// ─── Proofread suggestions ───────────────────────────────────────

/** `flag`: a line worth a second look, for the author to rewrite (no replacement to apply). */
export type Suggestion = { id: string; quote: string; replacement: string; type: string; explanation: string; flag?: boolean };

type SuggestionMeta = { set: Suggestion[] } | { remove: string };
const suggestionKey = new PluginKey<DecorationSet>("lineSuggestions");

function buildSuggestions(doc: PMNode, list: Suggestion[]) {
  const { text, posAt } = serializeDoc(doc.toJSON() as DocNode);
  const decos: Decoration[] = [];
  let hint = 0;
  for (const sug of list) {
    const a = findQuote(text, sug.quote, hint);
    const r = a && plainRangeToPos(posAt, a.start, a.end);
    if (!r) continue;
    hint = a.start;
    decos.push(
      Decoration.inline(
        r.from,
        r.to,
        { nodeName: "span", class: "suggestion", "data-suggestion": sug.id, "data-type": sug.type },
        // Remember the exact text so the suggestion is dropped if the author edits it.
        { id: sug.id, text: doc.textBetween(r.from, r.to, "\n", "\n") },
      ),
    );
  }
  return DecorationSet.create(doc, decos);
}

function LineSuggestions(onChange: (ids: string[]) => void) {
  const report = (set: DecorationSet) => {
    const ids = set.find().map((d) => (d.spec as { id: string }).id);
    queueMicrotask(() => onChange(ids));
  };
  return Extension.create({
    name: "lineSuggestions",
    addProseMirrorPlugins() {
      return [
        new Plugin<DecorationSet>({
          key: suggestionKey,
          state: {
            init: (_, state) => DecorationSet.create(state.doc, []),
            apply(tr, old) {
              const meta = tr.getMeta(suggestionKey) as SuggestionMeta | undefined;
              if (meta && "set" in meta) {
                const set = buildSuggestions(tr.doc, meta.set);
                report(set);
                return set;
              }
              let set = tr.docChanged ? old.map(tr.mapping, tr.doc) : old;
              let removed = false;
              if (meta && "remove" in meta) {
                set = set.remove(set.find(undefined, undefined, (spec) => spec.id === meta.remove));
                removed = true;
              }
              if (tr.docChanged) {
                // Drop suggestions whose text the author has since changed.
                const stale = set.find().filter((d) => tr.doc.textBetween(d.from, d.to, "\n", "\n") !== (d.spec as { text: string }).text);
                if (stale.length) {
                  set = set.remove(stale);
                  removed = true;
                }
              }
              if (removed) report(set);
              return set;
            },
          },
          props: { decorations: (state) => suggestionKey.getState(state) },
        }),
      ];
    },
  });
}

// ─── Editor ──────────────────────────────────────────────────────

type Props = {
  initialDoc: DocNode;
  notes: HighlightNote[];
  /** The selected note. Shown with a style rule rather than by redrawing the highlights,
   *  so clicking (or double-clicking) highlighted text behaves normally. */
  activeNoteId: string | null;
  onChange: (doc: DocNode) => void;
  onNoteClick: (id: string) => void;
  onAnchors: (found: Set<string>) => void;
  /** Ids of grammar suggestions still applicable (anchored and unchanged). */
  onSuggestions: (ids: string[]) => void;
  onSuggestionClick: (id: string) => void;
  /** Extra controls at the end of the toolbar. */
  toolbarExtra?: React.ReactNode;
};

export const ChapterEditor = forwardRef<ChapterEditorHandle, Props>(function ChapterEditor(props, ref) {
  // Keep the latest callbacks without re-creating the editor.
  const cb = useRef(props);
  cb.current = props;

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        listKeymap: false,
        code: false,
        codeBlock: false,
        strike: false,
        link: false,
        underline: false,
        trailingNode: false,
      }),
      Placeholder.configure({ placeholder: "Start writing…" }),
      NoteHighlights((found) => cb.current.onAnchors(found)),
      LineSuggestions((ids) => cb.current.onSuggestions(ids)),
    ],
    content: props.initialDoc,
    editorProps: {
      attributes: { class: "manuscript editor-body", spellcheck: "true", "aria-label": "Chapter text" },
    },
    onUpdate: ({ editor }) => cb.current.onChange(editor.getJSON() as DocNode),
  });

  // Rebuild highlights whenever the notes (or which one is active/dimmed) change.
  const notesKey = JSON.stringify(props.notes);
  useEffect(() => {
    if (!editor) return;
    editor.view.dispatch(editor.state.tr.setMeta(highlightKey, props.notes).setMeta("addToHistory", false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, notesKey]);

  useImperativeHandle(
    ref,
    () => ({
      revealNote(id) {
        const el = editor?.view.dom.querySelector(`mark[data-note="${CSS.escape(id)}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      },
      getDoc: () => (editor ? (editor.getJSON() as DocNode) : null),
      setSuggestions(list) {
        if (!editor) return;
        editor.view.dispatch(editor.state.tr.setMeta(suggestionKey, { set: list }).setMeta("addToHistory", false));
      },
      acceptSuggestion(id, replacement) {
        if (!editor) return;
        const set = suggestionKey.getState(editor.state);
        const deco = set?.find(undefined, undefined, (spec) => spec.id === id)[0];
        if (!deco) return;
        // One undoable step: replace the text (this also drops the suggestion, since its text changed).
        const tr = editor.state.tr.insertText(replacement, deco.from, deco.to).setMeta(suggestionKey, { remove: id });
        editor.view.dispatch(tr);
      },
      dismissSuggestion(id) {
        if (!editor) return;
        editor.view.dispatch(editor.state.tr.setMeta(suggestionKey, { remove: id }).setMeta("addToHistory", false));
      },
      revealSuggestion(id) {
        const el = editor?.view.dom.querySelector(`[data-suggestion="${CSS.escape(id)}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      },
    }),
    [editor],
  );

  const marks = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive("bold") ?? false,
      italic: editor?.isActive("italic") ?? false,
      canUndo: editor?.can().undo() ?? false,
      canRedo: editor?.can().redo() ?? false,
    }),
  });

  return (
    <div>
      <div className="sticky top-0 z-10 -mx-1 mb-4 flex flex-wrap items-center gap-1 rounded-lg border border-line bg-card/95 px-1 py-1 backdrop-blur max-lg:top-[49px]">
        <ToolButton label="Bold (Ctrl+B)" active={marks?.bold} onClick={() => editor?.chain().focus().toggleBold().run()}>
          <b>B</b>
        </ToolButton>
        <ToolButton label="Italic (Ctrl+I)" active={marks?.italic} onClick={() => editor?.chain().focus().toggleItalic().run()}>
          <i className="font-serif">I</i>
        </ToolButton>
        <ToolButton label="Scene break" onClick={() => editor?.chain().focus().setHorizontalRule().run()}>
          ✻
        </ToolButton>
        <span className="mx-1 h-5 w-px bg-line" />
        <ToolButton label="Undo (Ctrl+Z)" disabled={!marks?.canUndo} onClick={() => editor?.chain().focus().undo().run()}>
          ↶
        </ToolButton>
        <ToolButton label="Redo (Ctrl+Shift+Z)" disabled={!marks?.canRedo} onClick={() => editor?.chain().focus().redo().run()}>
          ↷
        </ToolButton>
        {props.toolbarExtra && <div className="ml-auto flex items-center gap-1">{props.toolbarExtra}</div>}
      </div>
      {props.activeNoteId && (
        <style>{`mark.note[data-note="${CSS.escape(props.activeNoteId)}"] { outline-color: var(--color-accent); }`}</style>
      )}
      <div
        onClick={(e) => {
          const target = e.target as HTMLElement;
          const sug = target.closest("[data-suggestion]")?.getAttribute("data-suggestion");
          if (sug) cb.current.onSuggestionClick(sug);
          const id = target.closest("mark[data-note]")?.getAttribute("data-note");
          if (id) cb.current.onNoteClick(id);
        }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
});

function ToolButton(props: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      aria-pressed={props.active}
      disabled={props.disabled}
      onMouseDown={(e) => e.preventDefault()} // keep the editor's selection
      onClick={props.onClick}
      className={`h-8 min-w-8 rounded-md px-2 text-sm transition disabled:opacity-30 ${props.active ? "bg-accent-soft font-medium text-accent" : "hover:bg-line/60"}`}
    >
      {props.children}
    </button>
  );
}
