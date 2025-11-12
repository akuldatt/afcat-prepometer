// app/page.jsx
// app/page.jsx  (server-side redirect)
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/prepometer');
}

