import {
  Button,
  Classes,
  Dialog,
  InputGroup,
  Intent,
  Label,
  Popover,
  Spinner,
  Tooltip,
} from "@blueprintjs/core";
import { useState, useRef, useEffect, useCallback } from "react";
import renderWithUnmount from "roamjs-components/util/renderWithUnmount";
import type { loadSharePageWithNotebook } from "@samepage/client";
import type { Apps, Notebook, AppId } from "@samepage/shared";
import MenuItemSelect from "roamjs-components/components/MenuItemSelect";

type SharePageReturn = ReturnType<typeof loadSharePageWithNotebook>;

type Props = {
  parentUid: string;
  apps: Apps;
} & Pick<
  SharePageReturn,
  "disconnectPage" | "sharePage" | "forcePushPage" | "listConnectedNotebooks"
>;

const formatVersion = (s: number) =>
  s ? new Date(s * 1000).toLocaleString() : "unknown";

const ConnectedNotebooks = ({
  uid,
  listConnectedNotebooks,
}: {
  uid: string;
  listConnectedNotebooks: Props["listConnectedNotebooks"];
}) => {
  const [loading, setLoading] = useState(true);
  const [notebooks, setNotebooks] = useState<
    Awaited<ReturnType<Props["listConnectedNotebooks"]>>["notebooks"]
  >([]);
  const [networks, setNetworks] = useState<
    Awaited<ReturnType<Props["listConnectedNotebooks"]>>["networks"]
  >([]);
  useEffect(() => {
    listConnectedNotebooks(uid)
      .then((r) => {
        setNotebooks(r.notebooks);
        setNetworks(r.networks);
      })
      .finally(() => setLoading(false));
  }, [setLoading]);
  return (
    <div className="flex p-4 rounded-md flex-col">
      {loading ? (
        <Spinner />
      ) : (
        <>
          <h3>Notebooks:</h3>
          <ul>
            {notebooks.map((c) => (
              <li key={`${c.app}-${c.workspace}`}>
                <div className="flex items-center justify-between">
                  <span>
                    {c.app}/{c.workspace}
                  </span>
                  <span className="opacity-75 text-gray-600 text-sm">
                    {formatVersion(c.version)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <h3>Networks:</h3>
          <ul>
            {networks.map((c) => (
              <li key={`${c.app}-${c.workspace}`}>
                <div className="flex items-center justify-between">
                  <span>
                    {c.app}/{c.workspace}
                  </span>
                  <span className="opacity-75 text-gray-600 text-sm">
                    {formatVersion(c.version)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
};

const InviteNotebook = ({
  parentUid,
  loading,
  setLoading,
  sharePage,
  apps = {},
}: {
  loading: boolean;
  parentUid: string;
  setLoading: (f: boolean) => void;
  sharePage: SharePageReturn["sharePage"];
  apps?: Record<string, { name: string }>;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [innerLoading, setInnerLoading] = useState(false);
  const closeDialog = useCallback(() => {
    setIsOpen(false);
    setLoading(false);
  }, [setIsOpen, setLoading]);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [currentApp, setCurrentApp] = useState(Object.keys(apps)[0]);
  const [currentworkspace, setCurrentWorkspace] = useState("");
  const onSubmit = useCallback(() => {
    setInnerLoading(true);
    sharePage({ notebookPageId: parentUid, notebooks })
      .then(closeDialog)
      .finally(() => setInnerLoading(false));
  }, [parentUid, currentworkspace, closeDialog, setInnerLoading]);
  return (
    <>
      <Tooltip content={"Invite Notebook"}>
        <Button
          icon={"plus"}
          minimal
          disabled={loading}
          onClick={() => {
            setIsOpen(true);
            setLoading(true);
          }}
        />
      </Tooltip>
      <Dialog
        isOpen={isOpen}
        title={"Invite Notebook"}
        onClose={closeDialog}
        canOutsideClickClose
        canEscapeKeyClose
        autoFocus={false}
        enforceFocus={false}
      >
        <div className={Classes.DIALOG_BODY}>
          {notebooks.map((g, i) => (
            <div
              className="flex gap-4 items-center"
              key={`${g.app}/${g.workspace}`}
            >
              <span className={"flex-grow"}>
                {apps[g.app].name} / {g.workspace}
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
            <Button
              text={"Cancel"}
              onClick={closeDialog}
              disabled={innerLoading}
            />
            <Button
              text={"Send"}
              intent={Intent.PRIMARY}
              onClick={onSubmit}
              disabled={innerLoading || !notebooks.length}
            />
          </div>
        </div>
      </Dialog>
    </>
  );
};

const SharedPageStatus = ({
  parentUid,
  sharePage,
  disconnectPage,
  forcePushPage,
  listConnectedNotebooks,
  apps,
}: Props) => {
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  return (
    <span
      className="samepage-shared-page-status flex gap-4 items-center text-lg mb-8"
      ref={containerRef}
    >
      <i>Shared</i>
      <Tooltip content={"Notebooks Connected"}>
        <Popover
          content={
            <ConnectedNotebooks
              uid={parentUid}
              listConnectedNotebooks={listConnectedNotebooks}
            />
          }
          target={<Button icon={"info-sign"} minimal disabled={loading} />}
        />
      </Tooltip>
      <InviteNotebook
        parentUid={parentUid}
        loading={loading}
        setLoading={setLoading}
        sharePage={sharePage}
        apps={apps}
      />
      <Tooltip content={"Disconnect Shared Page"}>
        <Button
          disabled={loading}
          icon={"th-disconnect"}
          minimal
          onClick={() => {
            setLoading(true);
            disconnectPage(parentUid).finally(() => setLoading(false));
          }}
        />
      </Tooltip>
      <Tooltip content={"Force Push Local Copy"}>
        <Button
          disabled={loading}
          icon={"warning-sign"}
          minimal
          onClick={() => {
            setLoading(true);
            forcePushPage(parentUid).finally(() => setLoading(false));
          }}
        />
      </Tooltip>
    </span>
  );
};

export const render = ({
  parent,
  ...props
}: Props & { parent: HTMLElement }) => {
  renderWithUnmount(<SharedPageStatus {...props} />, parent);
};

export default SharedPageStatus;
