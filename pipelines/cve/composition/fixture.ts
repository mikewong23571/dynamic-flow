// Fictional, explicitly supplied decisions. No model or real vulnerability was checked.
const alert = (
  id: string,
  relationId: string,
  repository: string,
  requestedRef: string,
  baseline: string,
  cve: string,
) => ({ id, relationId, repository, requestedRef, baseline, cve });
export const alerts = [
  alert('scan-01', 'api-main-A', 'api', 'main', 'api-old-main', 'DEMO-A'),
  alert(
    'scan-02-duplicate',
    'api-main-A',
    'api',
    'main',
    'api-old-main',
    'DEMO-A',
  ),
  alert('scan-03', 'api-main-B', 'api', 'main', 'api-old-main', 'DEMO-B'),
  alert(
    'scan-04',
    'api-release-A',
    'api',
    'release',
    'api-old-release',
    'DEMO-A',
  ),
  alert('scan-05', 'worker-C', 'worker', 'main', 'worker-old', 'DEMO-C'),
  alert('scan-06', 'portal-A', 'portal', 'main', 'portal-original', 'DEMO-A'),
  alert(
    'scan-07-missing',
    'worker-D',
    'worker',
    'main',
    'worker-old',
    'DEMO-D',
  ),
  alert(
    'scan-08-exception',
    'portal-B',
    'portal',
    'main',
    'portal-original',
    'DEMO-B',
  ),
];
const apiUpgrade = {
  id: 'dependency-upgrade',
  repository: 'api',
  requestedRef: 'main',
  description: '假设同一次依赖升级覆盖 A/B',
  dependsOn: [] as string[],
};
const assessment = (
  relationId: string,
  changes: (typeof apiUpgrade)[],
  successor: string,
) => {
  const scope = alerts.find((a) => a.relationId === relationId)!;
  return {
    id: relationId,
    repository: scope.repository,
    requestedRef: scope.requestedRef,
    baseline: scope.baseline,
    conclusion: '受影响',
    disposition: 'fixed',
    reason: '明确假设：本范围受影响，提供的变更与后继产物已逐问题验证',
    evidence: [`fixture:impact:${relationId}`],
    confirmation: '',
    changes,
    verification: {
      baseline: scope.baseline,
      successor,
      evidence: [`fixture:verification:${relationId}`],
    },
  };
};
export const assessments = [
  assessment('api-main-A', [apiUpgrade], 'api-new-main'),
  assessment('api-main-B', [apiUpgrade], 'api-new-main'),
  assessment(
    'api-release-A',
    [
      {
        ...apiUpgrade,
        requestedRef: 'release',
        description: '维护分支独立升级',
      },
    ],
    'api-new-release',
  ),
  assessment(
    'worker-C',
    [
      {
        id: 'base-image',
        repository: 'platform-images',
        requestedRef: 'stable',
        description: '修复共享基础镜像并发布',
        dependsOn: [],
      },
      {
        id: 'adopt-image',
        repository: 'worker',
        requestedRef: 'main',
        description: '采用已验证的新镜像并重建',
        dependsOn: ['platform-images@stable:base-image'],
      },
    ],
    'worker-new',
  ),
  {
    ...assessment('portal-A', [], ''),
    conclusion: '不受影响',
    disposition: 'excluded',
    reason: '明确假设：适用此基线的组件材料排除影响',
    verification: { baseline: '', successor: '', evidence: [] },
  },
  {
    ...assessment('portal-B', [], ''),
    disposition: 'exception',
    reason: '提出延期例外，用户尚未确认',
    verification: { baseline: '', successor: '', evidence: [] },
  },
];
