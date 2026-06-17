/** @jsxImportSource react */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer.js";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin.js";
import { ContentEditable } from "@lexical/react/LexicalContentEditable.js";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary.js";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin.js";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin.js";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext.js";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  KEY_ENTER_COMMAND,
} from "lexical";

type DocsEditorProps = {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
};

function SyncPlugin(props: { value: string }) {
  const [editor] = useLexicalComposerContext();
  const valueRef = useRef(props.value);

  useEffect(() => {
    if (valueRef.current === props.value) return;
    valueRef.current = props.value;
    editor.update(() => {
      const root = $getRoot();
      if (root.getTextContent() === props.value) return;
      root.clear();
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode(props.value));
      root.append(paragraph);
      root.selectEnd();
    });
  }, [editor, props.value]);

  return null;
}

function MarkdownEnterPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event) => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return false;
        event?.preventDefault();
        editor.update(() => {
          const sel = $getSelection();
          if (!$isRangeSelection(sel)) return;
          sel.insertText("\n");
        });
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor]);

  return null;
}

export function LexicalDocsEditor(props: DocsEditorProps) {
  const initialConfig = useMemo(
    () => ({
      namespace: "openwork-docs-editor",
      onError(error: Error) {
        throw error;
      },
      editable: true,
      editorState: () => {
        const root = $getRoot();
        root.clear();
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode(props.value));
        root.append(paragraph);
      },
    }),
    [],
  );

  const handleChange = useCallback(
    (state: Parameters<NonNullable<React.ComponentProps<typeof OnChangePlugin>["onChange"]>>[0]) => {
      state.read(() => {
        props.onChange($getRoot().getTextContent());
      });
    },
    [props],
  );

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="relative min-h-[320px] rounded-lg border border-dls-border bg-dls-surface p-4">
        <PlainTextPlugin
          contentEditable={
            <ContentEditable
              className="min-h-[280px] w-full resize-none whitespace-pre-wrap bg-transparent font-mono text-sm text-dls-text outline-none"
              aria-placeholder={props.placeholder}
              placeholder={<span />}
            />
          }
          placeholder={
            <div className="pointer-events-none absolute left-4 top-4 text-sm text-dls-secondary/70">
              {props.placeholder}
            </div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <OnChangePlugin onChange={handleChange} />
        <HistoryPlugin />
        <SyncPlugin value={props.value} />
        <MarkdownEnterPlugin />
      </div>
    </LexicalComposer>
  );
}
