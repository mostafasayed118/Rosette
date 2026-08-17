import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { getCurrentAdmin } from '@/features/auth/server';
import { signOut } from '@/features/auth/actions';

export default async function AdminPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  return <main className="content-frame"><p className="eyebrow">Rosette operations</p><h1>Admin dashboard</h1><p>Signed in as {admin.role}.</p><nav className="admin-links"><Link className="button" href="/admin/orders">Orders</Link><Link className="button" href="/admin/products">Products</Link><Link className="button" href="/admin/inventory">Inventory</Link><Link className="button" href="/admin/delivery">Delivery rules</Link></nav><form action={signOut}><Button type="submit">Sign out</Button></form></main>;
}
