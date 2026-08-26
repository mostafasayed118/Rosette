import { describe, expect, it } from 'vitest';
import AdminLayout from '@/app/admin/layout';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AdminShell } from '@/components/admin/AdminShell';
import AdminShellSource from '@/components/admin/AdminShell.tsx?raw';
import AdminLayoutSource from '@/app/admin/layout.tsx?raw';

describe('admin layout architecture', () => {
  it('exports a default AdminLayout function', () => {
    expect(typeof AdminLayout).toBe('function');
  });

  it('exposes SidebarProvider and AdminShell as named exports', () => {
    expect(typeof SidebarProvider).toBe('function');
    expect(typeof AdminShell).toBe('function');
  });

  it('AdminShell source no longer owns SidebarProvider', () => {
    expect(AdminShellSource).not.toMatch(/SidebarProvider/);
    expect(AdminShellSource).toMatch(/SidebarInset/);
    expect(AdminShellSource).toMatch(/SidebarTrigger/);
    expect(AdminShellSource).toMatch(/AppSidebar/);
  });

  it('AdminShell uses md:hidden (not the previous max-md:block typo)', () => {
    expect(AdminShellSource).toMatch(/md:hidden/);
    expect(AdminShellSource).not.toMatch(/max-md:block/);
  });

  it('app/admin/layout.tsx wires SidebarProvider around AdminShell', () => {
    expect(AdminLayoutSource).toMatch(/SidebarProvider/);
    expect(AdminLayoutSource).toMatch(/AdminShell/);
    expect(AdminLayoutSource).toMatch(/children/);
  });
});
