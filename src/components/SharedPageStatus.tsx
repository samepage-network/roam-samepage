import { Button, Tooltip } from "@blueprintjs/core";
import { useState, useRef } from "react";
import apiPost from "roamjs-components/util/apiPost";
import renderWithUnmount from "roamjs-components/util/renderWithUnmount";
import { removeSharedPage } from "../messages/sharePageWithGraph";
import { render as renderToast } from "roamjs-components/components/Toast";

type Props = {
  parentUid: string;
};

const SharedPageStatus = ({ parentUid }: Props) => {
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  return (
    <span className="flex gap-8 items-center text-lg mb-8" ref={containerRef}>
      <i>Shared</i>
      <Tooltip content={"Graphs Connected"}>
        <Button icon={"info-sign"} minimal disabled={loading} />
      </Tooltip>
      <Tooltip content={"Disconnect Shared Page"}>
        <Button
          disabled={loading}
          icon={"th-disconnect"}
          minimal
          onClick={() => {
            setLoading(true);
            apiPost<{ id: string; created: boolean }>("multiplayer", {
              method: "disconnect-shared-page",
              graph: window.roamAlphaAPI.graph.name,
              uid: parentUid,
            })
              .then(() => {
                removeSharedPage(parentUid);
                containerRef.current.parentElement.remove();
              })
              .catch(() =>
                renderToast({
                  content: `Successfully disconnected ${parentUid} from being shared.`,
                  id: "disconnect-shared-page",
                })
              )
              .finally(() => setLoading(false));
          }}
        />
      </Tooltip>
    </span>
  );
};

export const render = ({
  parent,
  ...props
}: { parent: HTMLElement } & Props) => {
  renderWithUnmount(<SharedPageStatus {...props} />, parent);
};

export default SharedPageStatus;
