import { Button, Tooltip } from "@blueprintjs/core";
import renderWithUnmount from "roamjs-components/util/renderWithUnmount";

const SharedPageStatus = () => {
  return (
    <span className="flex gap-8 items-center text-lg mb-8">
      <i>Shared</i>
      <Tooltip content={"Graphs Connected"}>
        <Button icon={"info-sign"} minimal />
      </Tooltip>
      <Tooltip content={"Disconnect Shared Page"}>
        <Button icon={"th-disconnect"} minimal />
      </Tooltip>
    </span>
  );
};

export const render = ({ parent }: { parent: HTMLElement }) => {
  renderWithUnmount(<SharedPageStatus />, parent);
};

export default SharedPageStatus;
