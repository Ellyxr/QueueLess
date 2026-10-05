import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';

export function assessDropoff(latitude: number, longitude: number, pickupLatitude: number, pickupLongitude: number, boundary = process.env.PASABUY_CAMPUS_BOUNDS) {
  if (![latitude, longitude, pickupLatitude, pickupLongitude].every(Number.isFinite) ||
    Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || Math.abs(pickupLatitude) > 90 || Math.abs(pickupLongitude) > 180)
    throw new BadRequestException('Valid latitude and longitude are required');
  const bounds = boundary?.split(',').map(value => value.trim() ? Number(value) : NaN);
  if (!bounds || bounds.length !== 4 || !bounds.every(Number.isFinite) ||
    bounds[0] >= bounds[2] || bounds[1] >= bounds[3] || bounds.some((v, i) => Math.abs(v) > (i % 2 ? 180 : 90)))
    throw new ServiceUnavailableException('Pasabuy campus boundary is not configured');
  const rad = (v: number) => v * Math.PI / 180;
  const a = Math.sin(rad(latitude - pickupLatitude) / 2) ** 2 +
    Math.cos(rad(pickupLatitude)) * Math.cos(rad(latitude)) * Math.sin(rad(longitude - pickupLongitude) / 2) ** 2;
  const clamped = Math.min(1, Math.max(0, a));
  const meters = 6371000 * 2 * Math.atan2(Math.sqrt(clamped), Math.sqrt(1 - clamped));
  const withinRecommendedRadius = meters <= 270 + 1e-6;
  return { distanceMeters: Math.ceil(meters), recommendedRadiusMeters: 270, withinRecommendedRadius,
    requiresConfirmation: !withinRecommendedRadius,
    warning: withinRecommendedRadius ? null : 'Destination is beyond the recommended 270 metre delivery radius. Continue only after confirming.',
    inCampus: latitude >= bounds[0] && latitude <= bounds[2] && longitude >= bounds[1] && longitude <= bounds[3] };
}
