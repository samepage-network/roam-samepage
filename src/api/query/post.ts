import createAPIGatewayProxyHandler from "samepage/backend/createAPIGatewayProxyHandler";

const logic = () => {
  return {
    results: [] as { uid: string }[],
  };
};

export default createAPIGatewayProxyHandler(logic);
