import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Spinner } from "@blueprintjs/core";
import createOverlayRender from "roamjs-components/util/createOverlayRender";
import getSubTree from "roamjs-components/util/getSubTree";
import getBasicTreeByParentUid from "roamjs-components/queries/getBasicTreeByParentUid";
import getSettingValueFromTree from "roamjs-components/util/getSettingValueFromTree";
import { render as renderToast } from "roamjs-components/components/Toast";
import { PullBlock } from "roamjs-components/types/native";
import createPage from "roamjs-components/writes/createPage";

const NOTIFICATION_EVENT = "roamjs:samepage:notification";

type Notification = {
  uid: string;
  title: string;
  description: string;
  actions: {
    label: string;
    method: string;
    args: Record<string, string>;
  }[];
};

const ActionButtons = ({
  actions,
  onSuccess,
}: {
  actions: {
    label: string;
    callback: () => Promise<void>;
  }[];
  onSuccess: () => void;
}) => {
  const [loading, setLoading] = useState(false);

  return (
    <>
      <div className={"flex gap-8"}>
        {actions.map((action) => (
          <Button
            key={action.label}
            text={action.label}
            className={"capitalize"}
            onClick={() => {
              setLoading(true);
              action
                .callback()
                .then(onSuccess)
                .catch((e) => {
                  console.error("Failed to process notification:", e);
                  renderToast({
                    id: "notification-error",
                    content: `Failed to process notification: ${
                      e.message || e
                    }`,
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

type Props = {
  actions: Record<string, (args: Record<string, string>) => Promise<void>>;
};

const NotificationContainer = ({ actions }: Props) => {
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
        title: getSettingValueFromTree({
          tree,
          key: "Title",
        }),
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
          }),
          args: Object.fromEntries(
            getSubTree({ key: "Args", tree: act.children }).children.map(
              (arg) => [arg.text, arg.children[0]?.text]
            )
          ),
        })),
      };
    });
  });
  const notificationsRef = useRef<Notification[]>(notifications);
  const addNotificaton = useCallback(
    (not: Notification) => {
      createPage({
        title: `roam/js/notifications/${not.uid}`,
        uid: not.uid,
        tree: [
          { text: "Title", children: [{ text: not.title }] },
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
        _setNotificatons([...notificationsRef.current]);
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
                    actions={not.actions.map((a) => ({
                      label: a.label,
                      callback: () => {
                        const action = actions[a.method];
                        if (action) return action(a.args);
                        return Promise.resolve();
                      },
                    }))}
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
          src={"https://samepage.network/images/logo.png"}
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

export const render = createOverlayRender<Props>(
  "samepage-notifications",
  NotificationContainer
);

export default NotificationContainer;
