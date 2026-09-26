'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import {
  AdminTableSkeleton,
  Badge,
  Button,
  Card,
  Checkbox,
  Input,
  Label,
  Table,
  TBody,
  THead,
  Td,
  Th,
  Tr,
} from '@edushare/ui';
import { Dialog, DialogContent, DialogTitle } from '@edushare/ui/client';
import { api, ApiRequestError, errorMessage } from '@/lib/api';
import { PageHeader } from '@/components/shell';

interface AdminRow {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  roles: string[];
  lastLoginAt: string | null;
}
interface Role {
  key: string;
  name: string;
  description: string | null;
  permissions: string[];
}

export default function UsersPage() {
  const qc = useQueryClient();
  const admins = useQuery({
    queryKey: ['admins'],
    queryFn: () => api.get<{ items: AdminRow[] }>('/admins'),
  });
  const roles = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get<{ items: Role[]; permissions: Record<string, string> }>('/roles'),
  });
  const [editing, setEditing] = useState<AdminRow | 'new' | null>(null);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    roleKeys: ['editor'],
    isActive: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: () =>
      editing === 'new'
        ? api.post('/admins', {
            name: form.name,
            email: form.email,
            password: form.password,
            roleKeys: form.roleKeys,
          })
        : api.patch(`/admins/${(editing as AdminRow).id}`, {
            name: form.name,
            roleKeys: form.roleKeys,
            isActive: form.isActive,
            ...(form.password ? { password: form.password } : {}),
          }),
    onSuccess: () => {
      toast.success('Saved');
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ['admins'] });
    },
    onError: (e) => {
      if (e instanceof ApiRequestError && e.fields) setErrors(e.fields);
      toast.error(errorMessage(e));
    },
  });
  const open = (a: AdminRow | 'new') => {
    setErrors({});
    setForm(
      a === 'new'
        ? { name: '', email: '', password: '', roleKeys: ['editor'], isActive: true }
        : { name: a.name, email: a.email, password: '', roleKeys: a.roles, isActive: a.isActive },
    );
    setEditing(a);
  };
  return (
    <>
      <PageHeader
        title="Users & roles"
        description="Administrators sign in to manage content. Public visitors never need accounts."
        actions={
          <Button onClick={() => open('new')}>
            <Plus className="size-4" aria-hidden="true" /> Add administrator
          </Button>
        }
      />
      {admins.isLoading ? <AdminTableSkeleton columns={4} /> : null}
      {admins.data ? (
        <Card className="mb-6 overflow-hidden">
          <Table>
            <THead>
              <Tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Roles</Th>
                <Th>Status</Th>
                <Th>Last sign-in</Th>
                <Th />
              </Tr>
            </THead>
            <TBody>
              {admins.data.items.map((a) => (
                <Tr key={a.id}>
                  <Td className="font-medium">{a.name}</Td>
                  <Td>{a.email}</Td>
                  <Td className="flex flex-wrap gap-1">
                    {a.roles.map((r) => (
                      <Badge key={r} variant="secondary">
                        {r}
                      </Badge>
                    ))}
                  </Td>
                  <Td>
                    {a.isActive ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Badge variant="muted">Disabled</Badge>
                    )}
                  </Td>
                  <Td className="text-muted-foreground text-xs">
                    {a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleString('en-GB') : 'Never'}
                  </Td>
                  <Td>
                    <Button size="xs" variant="outline" onClick={() => open(a)}>
                      Edit
                    </Button>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      ) : null}
      <h2 className="mb-3 text-lg font-semibold">Roles</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {roles.data?.items.map((r) => (
          <Card key={r.key} className="p-4">
            <p className="font-semibold">
              {r.name} <span className="text-muted-foreground font-mono text-xs">{r.key}</span>
            </p>
            <p className="text-muted-foreground mb-2 text-sm">{r.description}</p>
            <div className="flex flex-wrap gap-1">
              {r.permissions.map((p) => (
                <Badge key={p} variant="outline">
                  {p}
                </Badge>
              ))}
            </div>
          </Card>
        ))}
      </div>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle className="text-lg font-semibold">
            {editing === 'new' ? 'Add administrator' : 'Edit administrator'}
          </DialogTitle>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="n">Name</Label>
              <Input
                id="n"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="e">Email</Label>
              <Input
                id="e"
                type="email"
                value={form.email}
                disabled={editing !== 'new'}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p">
                {editing === 'new' ? 'Password' : 'New password (optional)'}
              </Label>
              <Input
                id="p"
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required={editing === 'new'}
              />
              <p className="text-muted-foreground text-xs">
                {errors.password ?? 'At least 10 characters with letters and numbers.'}
              </p>
            </div>
            <fieldset className="flex flex-col gap-1 text-sm">
              <legend className="mb-1 font-medium">Roles</legend>
              {roles.data?.items.map((r) => (
                <label key={r.key} className="flex items-center gap-2">
                  <Checkbox
                    checked={form.roleKeys.includes(r.key)}
                    onChange={() =>
                      setForm({
                        ...form,
                        roleKeys: form.roleKeys.includes(r.key)
                          ? form.roleKeys.filter((x) => x !== r.key)
                          : [...form.roleKeys, r.key],
                      })
                    }
                  />{' '}
                  {r.name}
                </label>
              ))}
            </fieldset>
            {editing !== 'new' ? (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />{' '}
                Account active
              </label>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending}>
                Save
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
