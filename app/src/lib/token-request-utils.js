export const hasExpired = (date, now, expireTime) => {
  const expirationDate = new Date(date + expireTime * 60 * 1000)
  return now >= expirationDate
}
