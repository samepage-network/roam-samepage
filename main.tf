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

// You _should_ migrate this data out and into SamePage's mysql DB before deleting 
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
    hash_key           = "id"
    name               = "id-index"
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