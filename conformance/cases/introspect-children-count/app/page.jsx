import { Children } from "react";

async function List({ children }) {
  "use cache";
  return <ul data-count={Children.count(children)}>{children}</ul>;
}

export default function Page() {
  return (
    <List>
      <li>a</li>
      <li>b</li>
      <li>c</li>
    </List>
  );
}
