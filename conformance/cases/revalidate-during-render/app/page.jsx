import { revalidatePath } from "next/cache";

export default function Page() {
  revalidatePath("/");
  return <p>ok</p>;
}
