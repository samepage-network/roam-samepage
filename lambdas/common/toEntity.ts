const toEntity = (s: string) =>
  process.env.NODE_ENV === "development" ? `dev-${s}` : s;

export default toEntity;
