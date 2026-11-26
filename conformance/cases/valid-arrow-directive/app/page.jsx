const getStamp = async () => {
  "use cache";
  return Date.now();
};

export default async function Page() {
  return <p>{await getStamp()}</p>;
}
