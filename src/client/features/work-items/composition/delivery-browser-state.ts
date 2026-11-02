/** Browsing state survives navigation. Delivered rows and fetched bodies never enter this object. */
export interface DeliveryBrowserState {
  table?: {
    query: string;
    order?: { field: string; desc: boolean };
    page: number;
    pageSize: number;
  };
}
