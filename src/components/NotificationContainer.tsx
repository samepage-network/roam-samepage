import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Spinner } from "@blueprintjs/core";
import createOverlayRender from "roamjs-components/util/createOverlayRender";
import rejectSharePageResponse from "../actions/rejectSharePageResponse";
import acceptSharePageResponse from "../actions/acceptSharePageResponse";
import getSubTree from "roamjs-components/util/getSubTree";
import getBasicTreeByParentUid from "roamjs-components/queries/getBasicTreeByParentUid";
import getSettingValueFromTree from "roamjs-components/util/getSettingValueFromTree";
import { render as renderToast } from "roamjs-components/components/Toast";
import { PullBlock } from "roamjs-components/types/native";
import createPage from "roamjs-components/writes/createPage";
import type { SamePageProps } from "../types";

const NOTIFICATION_EVENT = "roamjs:multiplayer:notification";

const ACTIONS: Record<
  string,
  (args: Record<string, string>, api: SamePageProps) => Promise<void>
> = {
  "reject share page response": rejectSharePageResponse,
  "accept share page response": acceptSharePageResponse,
} as const;

type NotificationAction = {
  label: string;
  method: string;
  args: Record<string, string>;
};

type Notification = {
  uid: string;
  title: string;
  description: string;
  actions: NotificationAction[];
};

const ActionButtons = ({
  api,
  actions,
  onSuccess,
}: {
  api: SamePageProps;
  actions: NotificationAction[];
  onSuccess: () => void;
}) => {
  const [loading, setLoading] = useState(false);
  return (
    <>
      <div className={"flex gap-8"}>
        {actions.map((action) => (
          <Button
            text={action.label}
            onClick={() => {
              setLoading(true);
              ACTIONS[action.method]?.(action.args, api)
                .then(onSuccess)
                .catch((e) => {
                  console.error(e);
                  renderToast({
                    id: "notification-error",
                    content: `Failed to process notification: ${e.message}`,
                    intent: "danger",
                  });
                })
                .finally(() => setLoading(false));
            }}
            style={{ marginRight: "8px" }}
            disabled={loading}
          />
        ))}
      </div>
      {loading && <Spinner size={12} />}
    </>
  );
};

const NotificationContainer = (props: SamePageProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, _setNotificatons] = useState<Notification[]>(() => {
    const pages = window.roamAlphaAPI.data.fast
      .q(
        `[:find (pull ?b [:block/uid :node/title]) :where [?b :node/title ?title] [(clojure.string/starts-with? ?title  "roam/js/notifications/")]]`
      )
      .map((r) => r[0] as PullBlock);
    return pages.map((block) => {
      const tree = getBasicTreeByParentUid(block[":block/uid"]);
      return {
        title: block[":node/title"],
        uid: block[":block/uid"],
        description: getSettingValueFromTree({
          tree,
          key: "Description",
        }),
        actions: getSubTree({
          tree,
          key: "Actions",
        }).children.map((act) => ({
          label: act.text,
          method: getSettingValueFromTree({
            tree: act.children,
            key: "Method",
          }) as keyof typeof ACTIONS,
          args: Object.fromEntries(
            getSubTree({ key: "Args", tree: act.children }).children.map(
              (arg) => [arg.text, arg.children[0]?.text]
            )
          ),
        })),
      };
    });
  });
  const notificationsRef = useRef<Notification[]>([]);
  const addNotificaton = useCallback(
    (not: Notification) => {
      createPage({
        title: `roam/js/notifications/${not.title}`,
        uid: not.uid,
        tree: [
          { text: "Description", children: [{ text: not.description }] },
          {
            text: "Actions",
            children: not.actions.map((a) => ({
              text: a.label,
              children: [
                { text: "Method", children: [{ text: a.method }] },
                {
                  text: "Args",
                  children: Object.entries(a.args).map((arg) => ({
                    text: arg[0],
                    children: [{ text: arg[1] }],
                  })),
                },
              ],
            })),
          },
        ],
      }).then(() => {
        notificationsRef.current.push(not);
        _setNotificatons(notificationsRef.current);
      });
    },
    [_setNotificatons, notificationsRef]
  );
  const removeNotificaton = useCallback(
    (not: Notification) => {
      window.roamAlphaAPI.deletePage({ page: { uid: not.uid } }).then(() => {
        notificationsRef.current = notificationsRef.current.filter(
          (n) => n.uid !== not.uid
        );
        _setNotificatons(notificationsRef.current);
      });
    },
    [_setNotificatons, notificationsRef]
  );
  useEffect(() => {
    document.body.addEventListener(NOTIFICATION_EVENT, (e: CustomEvent) => {
      addNotificaton(e.detail);
    });
  }, [addNotificaton]);
  return notifications.length ? (
    <div
      style={{
        position: "absolute",
        bottom: 8,
        right: 8,
        zIndex: 1000,
        boxShadow: "0px 0px 8px #00000080",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          height: 8,
          width: 8,
          background: "red",
          borderRadius: "50%",
        }}
      />
      {isOpen ? (
        <div style={{ background: "white", width: 280 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: 8,
              background: "#eeeeee80",
              borderBottom: "1px solid black",
            }}
          >
            <h4>Notifications</h4>
            <Button onClick={() => setIsOpen(false)} icon={"cross"} minimal />
          </div>
          <div>
            {notifications.map((not) => (
              <div key={not.uid} style={{ padding: "0 16px 4px" }}>
                <h5>{not.title}</h5>
                <p>{not.description}</p>
                <div style={{ gap: 8 }} className={"flex"}>
                  <ActionButtons
                    api={props}
                    actions={not.actions}
                    onSuccess={() => removeNotificaton(not)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <img
          onClick={() => setIsOpen(true)}
          src={"https://roamjs.com/images/logo-low-res.png"}
          style={{
            borderRadius: "50%",
            height: 24,
            width: 24,
            cursor: "pointer",
          }}
        />
      )}
    </div>
  ) : (
    <></>
  );
};

export const notify = (detail: Omit<Notification, "uid">) =>
  document.body.dispatchEvent(
    new CustomEvent(NOTIFICATION_EVENT, {
      detail: { ...detail, uid: window.roamAlphaAPI.util.generateUID() },
    })
  );

export const render = createOverlayRender(
  "samepage-notifications",
  NotificationContainer
);

export default NotificationContainer;
