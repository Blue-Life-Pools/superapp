export type CommercialActivity = {
  type: string; status?: string | null; occurredAt: string;
  proposalData?: { totalMonthlyInvestment?: string | number } | null;
};
export type CommercialSummaryProperty = {
  propertyType: string | null; lifecycleStatus: string;
  managementCompany: { name: string } | null;
  salesActivities: CommercialActivity[];
};

export function proposalInPeriod(activity: CommercialActivity, month: string) {
  return activity.type === 'PROPOSAL' && (month === 'all' || activity.occurredAt.slice(0, 7) === month);
}

export function commercialProposalMonths(properties: CommercialSummaryProperty[]) {
  return [...new Set(properties.flatMap((property) => property.salesActivities
    .filter((activity) => activity.type === 'PROPOSAL' && /^\d{4}-\d{2}-\d{2}/.test(activity.occurredAt))
    .map((activity) => activity.occurredAt.slice(0, 7))))].sort().reverse();
}

export function buildCommercialStats(properties: CommercialSummaryProperty[], month = 'all') {
  const typeCounts: Record<string, number> = {};
  const managementCounts: Record<string, number> = {};
  const proposalCounts: Record<string, number> = {};
  const proposalValues: Record<string, number> = {};
  for (const property of properties) {
    const type = property.propertyType ?? 'UNSPECIFIED';
    const company = property.managementCompany?.name ?? 'Unassigned';
    typeCounts[type] = (typeCounts[type] ?? 0) + 1;
    managementCounts[company] = (managementCounts[company] ?? 0) + 1;
    for (const activity of property.salesActivities.filter((item) => proposalInPeriod(item, month))) {
      const status = activity.status ?? 'CREATED';
      proposalCounts[status] = (proposalCounts[status] ?? 0) + 1;
      proposalValues[status] = (proposalValues[status] ?? 0) + Math.max(0, Number(activity.proposalData?.totalMonthlyInvestment) || 0);
    }
  }
  return {
    typeCounts, managementCounts, proposalCounts, proposalValues,
    totalProposals: Object.values(proposalCounts).reduce((sum, count) => sum + count, 0),
    totalProposalValue: Object.values(proposalValues).reduce((sum, value) => sum + value, 0),
    propertyCount: properties.length,
    clientCount: properties.filter((property) => property.lifecycleStatus === 'CLIENT').length,
  };
}

export function commercialProposalTrend(properties: CommercialSummaryProperty[], month: string) {
  const lastMonth = month === 'all' ? commercialProposalMonths(properties)[0] : month;
  if (!lastMonth) return [];
  const [year, number] = lastMonth.split('-').map(Number);
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(year, number - 6 + index, 1));
    const key = date.toISOString().slice(0, 7);
    const stats = buildCommercialStats(properties, key);
    return { month: key, value: stats.totalProposalValue, count: stats.totalProposals };
  });
}
