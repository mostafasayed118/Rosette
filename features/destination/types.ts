export type Country = {
  code: string;
  name: string;
};

export type City = {
  code: string;
  name: string;
  nameAr: string;
  countryCode: string;
  sameDay: boolean;
};

export type Destination = {
  countryCode: string;
  cityCode: string;
};
