import React, { useCallback, useMemo, useState } from "react";
import {
  Button,
  InputGroup,
  Classes,
  Dialog,
  Intent,
  Label,
} from "@blueprintjs/core";
import MenuItemSelect from "roamjs-components/components/MenuItemSelect";
import type { Notebook, Apps, AppId } from "samepage/types";

const GraphMessageDialog = ({
  onClose,
  children,
  disabled = false,
  onSubmit,
  title,
  apps = { 1: { name: "Roam" } },
}: {
  onClose: () => void;
  children?: React.ReactNode;
  disabled?: boolean;
  onSubmit: (notebooks: Notebook[]) => Promise<void>;
  title: string;
  apps?: Apps;
}) => {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [currentApp, setCurrentApp] = useState(Object.keys(apps)[0]);
  const [currentworkspace, setCurrentWorkspace] = useState("");
  const [loading, setLoading] = useState(false);
  const onClick = useCallback(() => {
    setLoading(true);
    onSubmit(notebooks)
      .then(onClose)
      .catch(() => setLoading(false));
  }, [onSubmit, onClose, notebooks]);
  const submitDisabled = useMemo(
    () => disabled || !notebooks.length,
    [disabled, notebooks]
  );
  return (
    <>
      <Dialog
        isOpen={true}
        title={title}
        onClose={onClose}
        canOutsideClickClose
        canEscapeKeyClose
        isCloseButtonShown={false}
        autoFocus={false}
      >
        <div className={Classes.DIALOG_BODY}>
          {children}
          {notebooks.map((g, i) => (
            <div
              className="flex gap-4 items-center mb-1"
              key={`${g.app}/${g.workspace}`}
            >
              <span className={"flex-grow"}>
                {apps[g.app].name}/{g.workspace}
              </span>
              <Button
                minimal
                icon={"trash"}
                onClick={() =>
                  setNotebooks(notebooks.filter((_, j) => j !== i))
                }
              />
            </div>
          ))}
          <div className="flex gap-4 items-center">
            <Label style={{ maxWidth: "120px", width: "100%" }}>
              App
              <MenuItemSelect
                items={Object.keys(apps)}
                activeItem={currentApp}
                onItemSelect={(a) => setCurrentApp(a)}
                transformItem={(a) => apps[Number(a)].name}
              />
            </Label>
            <Label>
              Workspace
              <InputGroup
                value={currentworkspace}
                onChange={(e) => setCurrentWorkspace(e.target.value)}
              />
            </Label>
            <Button
              minimal
              icon={"plus"}
              onClick={() => {
                setNotebooks([
                  ...notebooks,
                  {
                    app: Number(currentApp) as AppId,
                    workspace: currentworkspace,
                  },
                ]);
                setCurrentWorkspace("");
              }}
            />
          </div>
        </div>
        <div className={Classes.DIALOG_FOOTER}>
          <div className={Classes.DIALOG_FOOTER_ACTIONS}>
            <Button text={"Cancel"} onClick={onClose} disabled={loading} />
            <Button
              text={"Send"}
              intent={Intent.PRIMARY}
              onClick={onClick}
              disabled={submitDisabled || loading || !notebooks.length}
            />
          </div>
        </div>
      </Dialog>
    </>
  );
};

export default GraphMessageDialog;
