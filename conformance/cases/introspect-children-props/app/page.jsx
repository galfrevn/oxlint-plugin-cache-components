async function Card({ children }) {
  "use cache";
  return <section title={String(children.props.id)}>{children}</section>;
}

export default function Page() {
  return (
    <Card>
      <p id="intro">Hello</p>
    </Card>
  );
}
