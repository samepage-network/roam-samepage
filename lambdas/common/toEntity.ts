const toEntity = (s: string) =>
  process.env.NODE_ENV === "development" ? `${s}-dev` : s;

export default toEntity;
