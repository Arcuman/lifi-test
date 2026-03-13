export const problem = (
  type: string,
  title: string,
  status: number,
  detail: string,
  traceId?: string
) => ({
  type,
  title,
  status,
  detail,
  traceId
});
