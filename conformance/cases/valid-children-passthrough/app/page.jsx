async function Frame({ children, action }) {
  "use cache";
  return <form action={action}>{children}</form>;
}

async function save() {
  "use server";
}

export default function Page() {
  return (
    <Frame action={save}>
      <button type="submit">Save</button>
    </Frame>
  );
}
