declare module "*.ne" {
  import Nearley from "nearley";
  const Rules: Nearley.CompiledRules;
  export default Rules;
}
