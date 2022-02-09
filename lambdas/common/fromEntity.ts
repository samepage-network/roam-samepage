const fromEntity = (s: string) =>
  process.env.NODE_ENV === "development" ? s.replace(/-dev$/, '') : s;

export default fromEntity;
