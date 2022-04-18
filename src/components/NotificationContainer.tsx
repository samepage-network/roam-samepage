import { useCallback, useEffect, useRef, useState } from "react";
import createOverlayRender from "roamjs-components/util/createOverlayRender";

const NOTIFICATION_EVENT = "roamjs:multiplayer:notification";

type Notification = {
  title: string;
  description: string;
  actions: { label: string; callback: () => Promise<void> }[];
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
  useEffect(() => {
    document.body.addEventListener(NOTIFICATION_EVENT, (e: CustomEvent) => {
      addNotificaton(e.detail);
    });
  }, [addNotificaton]);
  return notifications.length ? (
    <div style={{ position: "absolute", bottom: 8, right: 8, zIndex: 1000 }}>
      {isOpen ? (
        <div></div>
      ) : (
        <img
          onClick={() => setIsOpen(false)}
          src={"https://roamjs.com/images/logo-low-res.png"}
          style={{ borderRadius: "50%", height: 24, width: 24 }}
        />
      )}
    </div>
  ) : (
    <></>
  );
};

export const notify = (detail: Notification) =>
  document.body.dispatchEvent(
    new CustomEvent(NOTIFICATION_EVENT, { detail })
  );

export const render = createOverlayRender(
  "multiplayer-notifications",
  NotificationContainer
);

export default NotificationContainer;
