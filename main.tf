terraform {
  backend "remote" {
    hostname = "app.terraform.io"
    organization = "VargasArts"
    workspaces {
      prefix = "roamjs-multiplayer"
    }
  }
  required_providers {
    github = {
      source = "integrations/github"
      version = "4.2.0"
    }
  }
}

data "aws_caller_identity" "current" {}

variable "aws_access_token" {
  type = string
}

variable "aws_secret_token" {
  type = string
}

variable "developer_token" {
  type = string
}

variable "github_token" {
  type = string
}

variable "password_secret_key" {
  type = string
}

provider "aws" {
  region = "us-east-1"
  access_key = var.aws_access_token
  secret_key = var.aws_secret_token
}

provider "github" {
    owner = "dvargas92495"
    token = var.github_token
}

module "roamjs_lambda" {
  source = "dvargas92495/lambda/roamjs"
  providers = {
    aws = aws
    github = github
  }

  name = "multiplayer"
  lambdas = [
    { 
      path = "multiplayer", 
      method = "post"
    },
  ]
  aws_access_token = var.aws_access_token
  aws_secret_token = var.aws_secret_token
  github_token     = var.github_token
  developer_token  = var.developer_token
}

resource "aws_dynamodb_table" "store" {
  name           = "RoamJSMultiplayer"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "id"
  range_key      = "entity"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "entity"
    type = "S"
  }

  attribute {
    name = "graph"
    type = "S"
  }

  attribute {
    name = "date"
    type = "S"
  }

  global_secondary_index {
    hash_key           = "entity"
    name               = "entity-index"
    non_key_attributes = []
    projection_type    = "ALL"
    read_capacity      = 0
    write_capacity     = 0
  }

  global_secondary_index {
    hash_key           = "graph"
    range_key          = "entity"
    name               = "graph-entity-index"
    non_key_attributes = []
    projection_type    = "ALL"
    read_capacity      = 0
    write_capacity     = 0
  }

  global_secondary_index {
    hash_key           = "entity"
    range_key          = "date"
    name               = "entity-date-index"
    non_key_attributes = []
    projection_type    = "ALL"
    read_capacity      = 0
    write_capacity     = 0
  }

  tags = {
    Application = "Roam JS Extensions"
  }
}

resource "aws_apigatewayv2_api" "ws" {
  name                       = "roamjs-multiplayer"
  protocol_type              = "WEBSOCKET"
  route_selection_expression = "$request.body.action"

  tags = {
    Application = "Roam JS Extensions"
  }
}

data "aws_iam_policy_document" "assume_lambda_policy" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "lambda_execution_policy" {
  statement {
    actions = [
      "ses:sendEmail",
      "s3:GetObject",
      "s3:ListBucket",
      "s3:PutObject",
      "s3:DeleteObject",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:CreateLogGroup"
    ]
    resources = ["*"]
  }

  statement {
    actions = [
      "dynamodb:BatchGetItem",
      "dynamodb:GetItem",
      "dynamodb:Query",
      "dynamodb:Scan",
      "dynamodb:BatchWriteItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
    ]
    resources = [
      aws_dynamodb_table.store.arn
    ]
  }

  statement {
    actions = [
      "dynamodb:Query",
    ]
    resources = [
      "${aws_dynamodb_table.store.arn}/index/*"
    ]
  }

  statement {
    actions = [
      "execute-api:Invoke"
    ]
    resources = [
      "arn:aws:execute-api:us-east-1:${data.aws_caller_identity.current.account_id}:${aws_apigatewayv2_api.ws.id}/production/POST/*"
    ]
  }

  statement {
    actions = [
      "execute-api:ManageConnections"
    ]
    resources = [
      "arn:aws:execute-api:us-east-1:${data.aws_caller_identity.current.account_id}:${aws_apigatewayv2_api.ws.id}/*"
    ]
  }

  statement {
    actions = [
      "sts:AssumeRole"
    ]
    resources = [
      "arn:aws:iam::*:role/roamjs-multiplayer-lambda-execution"
    ]
  }
}

resource "aws_iam_policy" "lambda_execution_policy" {
  name = "roamjs-multiplayer-lambda-execution"
  policy = data.aws_iam_policy_document.lambda_execution_policy.json
}

resource "aws_iam_role" "lambda_role" {
  name = "roamjs-multiplayer-lambda-execution"
  assume_role_policy = data.aws_iam_policy_document.assume_lambda_policy.json
  tags = {
    Application = "Roam JS Extensions"
  }
}

resource "aws_iam_role_policy_attachment" "lambda_role" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = aws_iam_policy.lambda_execution_policy.arn
}

# lambda resource requires either filename or s3... wow
data "archive_file" "dummy" {
  type        = "zip"
  output_path = "./dummy.zip"

  source {
    content   = "// TODO IMPLEMENT"
    filename  = "dummy.js"
  }
}

resource "aws_lambda_function" "onconnect" {
  filename      = "dummy.zip"
  function_name = "RoamJS_onconnect"
  role          = aws_iam_role.lambda_role.arn
  handler       = "onconnect.handler"
  runtime       = "nodejs14.x"
  timeout       = 10
}

resource "aws_apigatewayv2_integration" "onconnect" {
  api_id           = aws_apigatewayv2_api.ws.id
  integration_type = "AWS_PROXY"

  connection_type           = "INTERNET"
  content_handling_strategy = "CONVERT_TO_TEXT"
  integration_method        = "POST"
  integration_uri           = aws_lambda_function.onconnect.invoke_arn
  passthrough_behavior      = "WHEN_NO_MATCH"
}

resource "aws_lambda_permission" "onconnect" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.onconnect.function_name
  principal     = "apigateway.amazonaws.com"
}

resource "aws_apigatewayv2_route" "onconnect" {
  api_id    = aws_apigatewayv2_api.ws.id
  route_key = "$connect"
  target = "integrations/${aws_apigatewayv2_integration.onconnect.id}"
}

resource "aws_lambda_function" "ondisconnect" {
  filename      = "dummy.zip"
  function_name = "RoamJS_ondisconnect"
  role          = aws_iam_role.lambda_role.arn
  handler       = "ondisconnect.handler"
  runtime       = "nodejs14.x"
  timeout       = 10
}

resource "aws_apigatewayv2_integration" "ondisconnect" {
  api_id           = aws_apigatewayv2_api.ws.id
  integration_type = "AWS_PROXY"

  connection_type           = "INTERNET"
  content_handling_strategy = "CONVERT_TO_TEXT"
  integration_method        = "POST"
  integration_uri           = aws_lambda_function.ondisconnect.invoke_arn
  passthrough_behavior      = "WHEN_NO_MATCH"
}

resource "aws_lambda_permission" "ondisconnect" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ondisconnect.function_name
  principal     = "apigateway.amazonaws.com"
}

resource "aws_apigatewayv2_route" "ondisconnect" {
  api_id    = aws_apigatewayv2_api.ws.id
  route_key = "$disconnect"
  target = "integrations/${aws_apigatewayv2_integration.ondisconnect.id}"
}

resource "aws_lambda_function" "sendmessage" {
  filename      = "dummy.zip"
  function_name = "RoamJS_sendmessage"
  role          = aws_iam_role.lambda_role.arn
  handler       = "sendmessage.handler"
  runtime       = "nodejs14.x"
  timeout       = 10
  memory_size   = 5120
}

resource "aws_apigatewayv2_integration" "sendmessage" {
  api_id           = aws_apigatewayv2_api.ws.id
  integration_type = "AWS_PROXY"

  connection_type           = "INTERNET"
  content_handling_strategy = "CONVERT_TO_TEXT"
  integration_method        = "POST"
  integration_uri           = aws_lambda_function.sendmessage.invoke_arn
  passthrough_behavior      = "WHEN_NO_MATCH"
}

resource "aws_lambda_permission" "sendmessage" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.sendmessage.function_name
  principal     = "apigateway.amazonaws.com"
}

resource "aws_apigatewayv2_route" "sendmessage" {
  api_id    = aws_apigatewayv2_api.ws.id
  route_key = "sendmessage"
  target = "integrations/${aws_apigatewayv2_integration.sendmessage.id}"
}

resource "aws_apigatewayv2_deployment" "ws" {
  api_id      = aws_apigatewayv2_api.ws.id
  description = "Latest Multiplayer Deployment"

  triggers = {
    redeployment = sha1(join(",", [
      jsonencode(aws_apigatewayv2_integration.onconnect),
      jsonencode(aws_apigatewayv2_route.onconnect),
      jsonencode(aws_apigatewayv2_integration.ondisconnect),
      jsonencode(aws_apigatewayv2_route.ondisconnect),
      jsonencode(aws_apigatewayv2_integration.sendmessage),
      jsonencode(aws_apigatewayv2_route.sendmessage),
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_apigatewayv2_stage" "ws" {
  api_id = aws_apigatewayv2_api.ws.id
  name   = "production"
  deployment_id = aws_apigatewayv2_deployment.ws.id
  default_route_settings {
    logging_level = "INFO"
    throttling_burst_limit = 5000
    throttling_rate_limit = 10000
  }
}

resource "github_actions_secret" "web_socket_url" {
  repository       = "roamjs-multiplayer"
  secret_name      = "WEB_SOCKET_URL"
  plaintext_value  = aws_apigatewayv2_stage.ws.invoke_url
}

resource "github_actions_secret" "api_gateway_id" {
  repository       = "roamjs-multiplayer"
  secret_name      = "API_GATEWAY_ID"
  plaintext_value  = aws_apigatewayv2_api.ws.id
}

resource "github_actions_secret" "password_secret_key" {
  repository       = "roamjs-multiplayer"
  secret_name      = "PASSWORD_SECRET_KEY"
  plaintext_value  = var.password_secret_key
}
