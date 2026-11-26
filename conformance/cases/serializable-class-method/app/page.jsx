class Greeter {
  greet() {
    return "hello";
  }
}

async function getGreeting(greeter) {
  "use cache";
  return greeter.greet();
}

export default async function Page() {
  return <p>{await getGreeting(new Greeter())}</p>;
}
