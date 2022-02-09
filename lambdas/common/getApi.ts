import AWS from "aws-sdk";

const getApi = () =>
  new AWS.ApiGatewayManagementApi({
    endpoint: `https://${process.env.API_GATEWAY_ID}.execute-api.us-east-1.amazonaws.com`,
  });

export default getApi;
