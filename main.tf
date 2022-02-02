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

  global_secondary_index {
    hash_key           = "entity"
    name               = "entity-index"
    non_key_attributes = []
    projection_type    = "ALL"
    read_capacity      = 0
    write_capacity     = 0
  }

  tags = {
    Application = "Roam JS Extensions"
  }
}

data "aws_iam_role" "roamjs_lambda_role" {
  name = "roam-js-extensions-lambda-execution"
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

resource "aws_apigatewayv2_api" "ws" {
  name                       = "roamjs-multiplayer"
  protocol_type              = "WEBSOCKET"
  route_selection_expression = "$request.body.action"

  tags = {
    Application = "Roam JS Extensions"
  }
}

resource "aws_apigatewayv2_route" "onconnect" {
  api_id    = aws_apigatewayv2_api.ws.id
  route_key = "$onconnect"
}

resource "aws_lambda_function" "onconnect" {
  filename      = "dummy.zip"
  function_name = "RoamJS_onconnect"
  role          = data.aws_iam_role.roamjs_lambda_role.arn
  handler       = "onconnect.handler"
  runtime       = "nodejs14.x"
}

resource "aws_apigatewayv2_integration" "onconnect" {
  api_id           = aws_apigatewayv2_api.ws.id
  integration_type = "AWS"

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
  source_arn    = "${aws_apigatewayv2_api.ws.execution_arn}/*/*/*"
}

resource "aws_apigatewayv2_route" "ondisconnect" {
  api_id    = aws_apigatewayv2_api.ws.id
  route_key = "$ondisconnect"
}

resource "aws_lambda_function" "ondisconnect" {
  filename      = "dummy.zip"
  function_name = "RoamJS_ondisconnect"
  role          = data.aws_iam_role.roamjs_lambda_role.arn
  handler       = "ondisconnect.handler"
  runtime       = "nodejs14.x"
}

resource "aws_apigatewayv2_integration" "ondisconnect" {
  api_id           = aws_apigatewayv2_api.ws.id
  integration_type = "AWS"

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
  source_arn    = "${aws_apigatewayv2_api.ws.execution_arn}/*/*/*"
}

resource "aws_apigatewayv2_route" "sendmessage" {
  api_id    = aws_apigatewayv2_api.ws.id
  route_key = "$sendmessage"
}

resource "aws_lambda_function" "sendmessage" {
  filename      = "dummy.zip"
  function_name = "RoamJS_sendmessage"
  role          = data.aws_iam_role.roamjs_lambda_role.arn
  handler       = "sendmessage.handler"
  runtime       = "nodejs14.x"
}

resource "aws_apigatewayv2_integration" "sendmessage" {
  api_id           = aws_apigatewayv2_api.ws.id
  integration_type = "AWS"

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
  source_arn    = "${aws_apigatewayv2_api.ws.execution_arn}/*/*/*"
}
