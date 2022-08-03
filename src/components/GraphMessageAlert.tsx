import React, { useCallback, useMemo, useState } from "react";
import {
  Button,
  InputGroup,
  Classes,
  Dialog,
  Intent,
  Label,
} from "@blueprintjs/core";

const GraphMessageAlert = ({
  onClose,
  children,
  disabled = false,
  onSubmitToGraph,
  title,
}: {
  onClose: () => void;
  children?: React.ReactNode;
  disabled?: boolean;
  onSubmitToGraph: (graph: string) => Promise<void>;
  title: string;
}) => {
  const [graphs, setGraphs] = useState<string[]>([]);
  const [currentGraph, setCurrentGraph] = useState("");
  const [loading, setLoading] = useState(false);
  const onSubmit = useCallback(() => {
    setLoading(true);
    Promise.all(Array.from(graphs).map(onSubmitToGraph))
      .then(onClose)
      .catch(() => setLoading(false));
  }, [onSubmitToGraph, onClose, graphs]);
  const submitDisabled = useMemo(() => disabled || !graphs, [disabled, graphs]);
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
        canOutsideClickClose
        canEscapeKeyClose
        autoFocus={false}
      >
        <div className={Classes.DIALOG_BODY} onKeyDown={onKeyDown}>
          {children}
          {graphs.map((g, i) => (
            <div className="flex gap-4 items-center">
              <span className={"flex-grow"}>{g}</span>
              <Button
                minimal
                icon={"trash"}
                onClick={() => setGraphs(graphs.filter((_, j) => j !== i))}
              />
            </div>
          ))}
          <Label>
            Graph
            <InputGroup
              rightElement={
                <Button
                  minimal
                  icon={"plus"}
                  onClick={() => {
                    setGraphs([...graphs, currentGraph]);
                    setCurrentGraph("");
                  }}
                />
              }
              value={currentGraph}
              onChange={e => setCurrentGraph(e.target.value)}
            />
          </Label>
        </div>
        <div className={Classes.DIALOG_FOOTER}>
          <div className={Classes.DIALOG_FOOTER_ACTIONS}>
            <Button text={"Cancel"} onClick={onClose} disabled={loading} />
            <Button
              text={"Send"}
              intent={Intent.PRIMARY}
              onClick={onSubmit}
              disabled={submitDisabled || loading}
            />
          </div>
        </div>
      </Dialog>
    </>
  );
};

export default GraphMessageAlert;
