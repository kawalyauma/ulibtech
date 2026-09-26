'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  AdminTableSkeleton,
  Button,
  Card,
  NativeSelect,
  Table,
  TBody,
  THead,
  Td,
  Th,
  Tr,
} from '@edushare/ui';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/shell';

interface Log {
  id: number;
  adminName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  changes: Record<string, unknown> | null;
  createdAt: string;
  ipAddress: string | null;
}

const ACTIONS: Record<string, string> = {
  'resource.upload': 'Uploaded resource',
  'resource.update': 'Edited resource',
  'resource.seo_update': 'Changed SEO',
  'resource.publish': 'Published resource',
  'resource.unpublish': 'Unpublished resource',
  'resource.archive': 'Archived resource',
  'resource.delete': 'Deleted resource',
  'resource.replace_file': 'Replaced file',
  'resource.set_version': 'Changed public version',
  'auth.login': 'Signed in',
  'auth.login_failed': 'Failed sign-in',
};

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState('');
  const q = useQuery({
    queryKey: ['audit', page, entityType],
    queryFn: () =>
      api.get<{ items: Log[]; totalPages: number }>(
        `/audit?page=${page}&pageSize=50${entityType ? `&entityType=${entityType}` : ''}`,
      ),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every significant administrative action is recorded."
        actions={
          <NativeSelect
            aria-label="Filter by type"
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value);
              setPage(1);
            }}
            className="w-44"
          >
            <option value="">All activity</option>
            <option value="resource">Resources</option>
            <option value="admin">Sign-ins & admins</option>
            <option value="seo">SEO</option>
            <option value="setting">Settings</option>
            <option value="collection">Collections</option>
          </NativeSelect>
        }
      />
      {q.isLoading ? <AdminTableSkeleton columns={4} /> : null}
      {q.data ? (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <Tr>
                <Th>Date</Th>
                <Th>Admin</Th>
                <Th>Action</Th>
                <Th>Item</Th>
                <Th>Details</Th>
              </Tr>
            </THead>
            <TBody>
              {q.data.items.map((l) => (
                <Tr key={l.id}>
                  <Td className="text-muted-foreground text-xs whitespace-nowrap">
                    {new Date(l.createdAt).toLocaleString('en-GB')}
                  </Td>
                  <Td>{l.adminName ?? 'system'}</Td>
                  <Td>{ACTIONS[l.action] ?? l.action}</Td>
                  <Td className="max-w-xs truncate">{l.entityLabel ?? l.entityId ?? '—'}</Td>
                  <Td
                    className="text-muted-foreground max-w-sm truncate font-mono text-xs"
                    title={l.changes ? JSON.stringify(l.changes) : ''}
                  >
                    {l.changes ? JSON.stringify(l.changes) : ''}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          <div className="flex justify-end gap-2 border-t p-3">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= q.data.totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </Card>
      ) : null}
    </>
  );
}
