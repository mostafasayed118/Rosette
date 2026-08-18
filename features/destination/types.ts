export type Country = {
  code: string;
  name: string;
};

export type City = {
  code: string;
  slug: string;
  name: string;
  nameAr: string;
  nameFr?: string;
  countryCode: string;
  sameDay: boolean;
};

export type Destination = {
  countryCode: string;
  cityCode: string;
};
