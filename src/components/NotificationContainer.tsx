import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@blueprintjs/core";
import createOverlayRender from "roamjs-components/util/createOverlayRender";
import createBlock from "roamjs-components/writes/createBlock";
import deleteBlock from "roamjs-components/writes/deleteBlock";
import rejectSharePageResponse from "../actions/rejectSharePageResponse";
import acceptSharePageResponse from "../actions/acceptSharePageResponse";
import getSubTree from "roamjs-components/util/getSubTree";
import getChildrenLengthByPageUid from "roamjs-components/queries/getChildrenLengthByPageUid";
import getBasicTreeByParentUid from "roamjs-components/queries/getBasicTreeByParentUid";
import getSettingValueFromTree from 'roamjs-components/util/getSettingValueFromTree';

const NOTIFICATION_EVENT = "roamjs:multiplayer:notification";

const actions = {
  "reject share page response": rejectSharePageResponse,
  "accept share page response": acceptSharePageResponse,
};

type Notification = {
  uid: string;
  title: string;
  description: string;
  actions: {
    label: string;
    method: keyof typeof actions;
    args: Record<string, string>;
  }[];
};

type Props = { configUid: string };

const KEY = "Notifications";

const NotificationContainer = ({ configUid }: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, _setNotificatons] = useState<Notification[]>(() => {
    const tree = getBasicTreeByParentUid(configUid);
    const notificationTree = getSubTree({ tree, key: KEY });
    return notificationTree.children.map((node) => ({
      title: node.text,
      uid: node.uid,
      description: getSettingValueFromTree({
        tree: node.children,
        key: "Description",
      }),
      actions: getSubTree({ tree: node.children, key: "Actions" }).children.map(
        (act) => ({
          label: act.text,
          method: getSettingValueFromTree({
            tree: act.children,
            key: "Method",
          }) as keyof typeof actions,
          args: Object.fromEntries(
            getSubTree({ key: "Args", tree: act.children }).children.map(
              (arg) => [arg.text, arg.children[0]?.text]
            )
          ),
        })
      ),
    }));
  });
  const notificationsRef = useRef<Notification[]>([]);
  const addNotificaton = useCallback(
    (not: Notification) => {
      const parentUid = getSubTree({
        parentUid: configUid,
        key: KEY,
      }).uid;
      (parentUid
        ? Promise.resolve(parentUid)
        : createBlock({ parentUid, order: 10, node: { text: KEY } })
      )
        .then((parentUid) =>
          createBlock({
            parentUid,
            order: getChildrenLengthByPageUid(parentUid),
            node: {
              uid: not.uid,
              text: not.title,
              children: [
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
            },
          })
        )
        .then(() => {
          notificationsRef.current.push(not);
          _setNotificatons(notificationsRef.current);
        });
    },
    [_setNotificatons, notificationsRef, configUid]
  );
  const removeNotificaton = useCallback(
    (not: Notification) => {
      deleteBlock(not.uid).then(() => {
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
        <div>
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
            <Button onClick={() => setIsOpen(false)} icon={"cross"} />
          </div>
          <div>
            {notifications.map((not) => (
              <div key={not.uid}>
                <h5>{not.title}</h5>
                <p>{not.description}</p>
                <div style={{ gap: 8 }}>
                  {not.actions.map((action) => (
                    <Button
                      key={action.label}
                      text={action.label}
                      onClick={() =>
                        actions[action.method]?.(action.args).then(() =>
                          removeNotificaton(not)
                        )
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <img
          onClick={() => setIsOpen(true)}
          src={"https://roamjs.com/images/logo-low-res.png"}
          style={{ borderRadius: "50%", height: 24, width: 24 }}
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
  "multiplayer-notifications",
  NotificationContainer
);

export default NotificationContainer;
