import ReactDOM from "react-dom";
import { Button, Tooltip } from "@blueprintjs/core";

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
  ReactDOM.render(<SharedPageStatus />, parent);
};

export default SharedPageStatus;
