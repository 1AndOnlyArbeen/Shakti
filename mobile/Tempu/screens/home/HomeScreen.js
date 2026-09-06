import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapPicker from '../../components/MapPicker';
import { colors, shadow } from '../../theme';
import ActiveTripSheet from './ActiveTripSheet';
import BiddingSheet from './BiddingSheet';
import HomeView from './HomeView';
import Map from './Map';
import OptionsSheet from './OptionsSheet';
import SearchSheet from './SearchSheet';
import useRideFlow, { VEHICLE_TYPES } from './useRideFlow';
import useBackHandler from '../../utils/useBackHandler';

export default function HomeScreen({ onOpenSubscription }) {
  const flow = useRideFlow();
  const {
    step,
    pickup,
    setPickup,
    pickupCoords,
    setPickupCoords,
    destination,
    setDestination,
    destCoords,
    setDestCoords,
    vehicleId,
    setVehicleId,
    offeredPrice,
    setOfferedPrice,
    payment,
    acceptedBid,
    tripStatus,
    standardFare,
    setStep,
    goBack,
    reset,
    requestRide,
    acceptBid,
    bids,
    creatingTrip,
    tripError,
    tripId,
  } = flow;

  const [mapTarget, setMapTarget] = useState('dest');

  // Hardware back retraces the booking flow (bidding → options → search → home).
  // Deliberately excludes 'active': backing out of a live trip should be a
  // conscious tap on the sheet, not a stray back press.
  useBackHandler(() => {
    if (step === 'home' || step === 'active') return false;
    goBack();
    return true;
  });

  const goToOptions = (dest, coords = null) => {
    setDestination(dest);
    if (coords) setDestCoords(coords);
    const rickshaw = VEHICLE_TYPES.find((v) => v.id === 'tuktuk');
    if (rickshaw) {
      setVehicleId('tuktuk');
      setOfferedPrice(String(rickshaw.baseFare));
    }
    setStep('options');
  };

  const openMapFor = (target) => {
    setMapTarget(target);
    setStep('map-pick');
  };

  if (step === 'home') {
    return (
      <HomeView
        onTapSearch={() => setStep('search')}
        onPickSaved={goToOptions}
        onSubscribe={onOpenSubscription}
      />
    );
  }

  const vehicle = VEHICLE_TYPES.find((v) => v.id === vehicleId);

  // Extract driver info from the accepted bid's populated driverId field
  const acceptedDriver = acceptedBid?.driverId
    ? {
        name: acceptedBid.driverId.userId?.name || 'Driver',
        vehicleType: acceptedBid.driverId.vehicleType || 'tuktuk',
        vehicleColor: acceptedBid.driverId.vehicleColor || '',
        vehicleModel: acceptedBid.driverId.vehicleModel || '',
        vehiclePlate: acceptedBid.driverId.vehiclePlate || '',
        rating: acceptedBid.driverId.rating ?? 0,
        eta: 5,
        phone: acceptedBid.driverId.userId?.phone,
      }
    : null;

  // Driver's live position from the accepted bid (GeoJSON [lng, lat]), if the
  // populated driver carries one — shown as a moving car pin during the trip.
  const driverLoc =
    acceptedBid?.driverId?.currentLocation?.coordinates ||
    acceptedBid?.driverId?.location?.coordinates;
  const driverCoords = Array.isArray(driverLoc) && driverLoc.length === 2
    ? { lat: driverLoc[1], lng: driverLoc[0] }
    : null;

  return (
    <View style={styles.root}>
      <Map step={step} pickupCoords={pickupCoords} destCoords={destCoords} driverCoords={driverCoords} />

      {step !== 'active' && (
        <View style={styles.topBar}>
          <Pressable style={styles.backBtn} onPress={goBack} hitSlop={8}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </Pressable>
        </View>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrap}
      >
        {step === 'search' && (
          <SearchSheet
            pickup={pickup}
            setPickup={setPickup}
            setPickupCoords={setPickupCoords}
            destination={destination}
            setDestination={setDestination}
            onPick={goToOptions}
            onBack={goBack}
            onSubmit={() => destination.trim() && goToOptions(destination)}
            onPickPickupOnMap={() => openMapFor('pickup')}
            onPickDestOnMap={() => openMapFor('dest')}
          />
        )}

        <MapPicker
          visible={step === 'map-pick'}
          title={mapTarget === 'pickup' ? 'Pickup' : 'Drop-off'}
          onCancel={() => setStep('search')}
          onConfirm={({ address, coords }) => {
            if (mapTarget === 'pickup') {
              setPickup(address);
              setPickupCoords(coords);
              setStep('search');
            } else {
              goToOptions(address, coords);
            }
          }}
        />

        {step === 'options' && (
          <>
            {tripError ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{tripError}</Text>
              </View>
            ) : null}
            <OptionsSheet
              pickup={pickup}
              destination={destination}
              vehicleId={vehicleId}
              setVehicleId={setVehicleId}
              offeredPrice={offeredPrice}
              setOfferedPrice={setOfferedPrice}
              standardFare={standardFare}
              onConfirm={requestRide}
              loading={creatingTrip}
            />
          </>
        )}

        {step === 'bidding' && (
          <BiddingSheet
            vehicle={vehicle}
            offeredPrice={Number(offeredPrice)}
            bids={bids}
            onAccept={acceptBid}
            onCancel={goBack}
          />
        )}

        {step === 'active' && acceptedBid && acceptedDriver && (
          <ActiveTripSheet
            driver={acceptedDriver}
            bid={acceptedBid}
            destination={destination}
            payment={payment}
            tripStatus={tripStatus}
            onComplete={reset}
            onCancel={reset}
          />
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  topBar: {
    position: 'absolute',
    top: 56,
    left: 18,
    right: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.fab,
  },
  sheetWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
  },
  errorBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: colors.dangerSoft,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  errorBannerText: { color: colors.danger, fontSize: 13, fontWeight: '500' },
});
