import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@blueprintjs/core";
import createOverlayRender from "roamjs-components/util/createOverlayRender";
import { v4 } from "uuid";

const NOTIFICATION_EVENT = "roamjs:multiplayer:notification";

type Notification = {
  uuid: string;
  date: number;
  title: string;
  description: string;
  actions: { label: string; callback: () => Promise<unknown> }[];
};

const NotificationContainer = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, _setNotificatons] = useState<Notification[]>([]);
  const notificationsRef = useRef<Notification[]>([]);
  const addNotificaton = useCallback(
    (not: Notification) => {
      notificationsRef.current.push(not);
      _setNotificatons(notificationsRef.current);
    },
    [_setNotificatons, notificationsRef]
  );
  const removeNotificaton = useCallback(
    (not: Notification) => {
      notificationsRef.current = notificationsRef.current.filter(
        (n) => n.uuid !== not.uuid
      );
      _setNotificatons(notificationsRef.current);
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
              <div key={not.uuid}>
                <h5>{not.title}</h5>
                <p>{not.description}</p>
                <div style={{ gap: 8 }}>
                  {not.actions.map((action) => (
                    <Button
                      key={action.label}
                      text={action.label}
                      onClick={() =>
                        action.callback().then(() => removeNotificaton(not))
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

export const notify = (detail: Omit<Notification, "uuid" | "date">) =>
  document.body.dispatchEvent(
    new CustomEvent(NOTIFICATION_EVENT, {
      detail: { ...detail, uuid: v4(), date: new Date().valueOf() },
    })
  );

export const render = createOverlayRender(
  "multiplayer-notifications",
  NotificationContainer
);

export default NotificationContainer;
