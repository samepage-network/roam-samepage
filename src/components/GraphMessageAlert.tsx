import React, { useCallback, useMemo, useState } from "react";
import { Button, Checkbox, Classes, Dialog, Intent } from "@blueprintjs/core";

const GraphMessageAlert = ({
  onClose,
  children,
  disabled,
  onSubmitToGraph,
  title,
}: {
  onClose: () => void;
  children?: React.ReactNode;
  disabled: boolean;
  onSubmitToGraph: (graph: string) => void;
  title: string;
}) => {
  const allGraphs = useMemo(
    () => window.roamjs.extension.multiplayer.getNetworkedGraphs(),
    []
  );
  const [graphs, setGraphs] = useState(new Set<string>());
  const onSubmit = useCallback(() => {
    Array.from(graphs).forEach(onSubmitToGraph);
    onClose();
  }, [onSubmitToGraph, onClose, graphs]);
  const submitDisabled = useMemo(
    () => disabled || !graphs.size,
    [disabled, graphs.size]
  );
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (
        e.key === "Enter" &&
        !e.shiftKey &&
        !e.altKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        !submitDisabled
      ) {
        onSubmit();
      }
      e.stopPropagation();
    },
    [onSubmit, submitDisabled]
  );
  return (
    <>
      <Dialog
        isOpen={true}
        title={title}
        onClose={onClose}
        isCloseButtonShown
        canOutsideClickClose
        canEscapeKeyClose
      >
        <div className={Classes.DIALOG_BODY} onKeyDown={onKeyDown}>
          {children}
          {allGraphs.length > 1 && (
            <Checkbox
              labelElement={<b>Select All</b>}
              checked={graphs.size >= allGraphs.length}
              onChange={(e) => {
                const val = (e.target as HTMLInputElement).checked;
                if (val) {
                  setGraphs(new Set(allGraphs));
                } else {
                  setGraphs(new Set());
                }
              }}
            />
          )}
          {allGraphs.map((g) => (
            <Checkbox
              label={g}
              key={g}
              checked={graphs.has(g)}
              onChange={(e) => {
                const val = (e.target as HTMLInputElement).checked;
                if (val) {
                  graphs.add(g);
                } else {
                  graphs.delete(g);
                }
                setGraphs(new Set(graphs));
              }}
            />
          ))}
        </div>
        <div className={Classes.DIALOG_FOOTER}>
          <div className={Classes.DIALOG_FOOTER_ACTIONS}>
            <Button text={"Cancel"} onClick={onClose} />
            <Button
              text={"Send"}
              intent={Intent.PRIMARY}
              onClick={onSubmit}
              disabled={submitDisabled}
            />
          </div>
        </div>
      </Dialog>
    </>
  );
};

export default GraphMessageAlert;
