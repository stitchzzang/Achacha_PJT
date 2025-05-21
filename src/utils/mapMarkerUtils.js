// 지도에 마커 업데이트
export const updateMapMarkers = (webViewRef, brandStores, selectedBrandId) => {
  const markerImageBase64 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAABICAYAAAC0hqYWAAAACXBIWXMAACE4AAAhOAFFljFgAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAATnSURBVHgB3Zs/jNNIFMaffQsksMWmgjJI9LdXg4RTQXcnQUO1oUc6qKA7U1KRk6C+bA/SldCwpqC+0CPhq45uo9PqOP6ted9kxjiOHc94xonDT/LGdmxnPr/vjcczsx454G0Q7Ox43o+UJLu8qZYdXvqZw6a8xHKZkOdNpkny8nwUTckBHllwOBhc5sKH9K3gdYh4GfeiaJ8sMBYi7j7Rr7x6m+oXvoiYlzH5/rj34sXfZIiRkMMg2OOPEbkVkCfGb3CEfjc5SUvIP0HQ7xD9wasBrY6YoxPoRsevOgB5wCIOaLUiQJ+OjyfSBZUsFSIukiQRzdc+qwQWHnM5fqs6sNRa8k6MqT2EnDf3y74sFMJ2+pkj8Se1j9tllcCCEJnYf1GzNVN9PC/oHRy8zO9eyBGZ2O0UAZIEObNQvjkhMqn61G76vCwkf2otaam3ZIF/9ix1hkM6cekSedvb9HkyofePHontU9evi31f3ryhD0+e0Mfnz8mKnMVSIRwNPPCGVBOI2B6NyD93Tut4CPzw9ClZEHHiD9Lfxx9EgyxEgK3d3VQE7jgKmhwdpd+rfcfv3oltRM6SQDRa1e+LixJdJksgBKDw7x8/FusQBksBtQ/2ggh84nslrBZJ8gv/FfbakrtCMsA7c4Z+uHBhfh8XLC3o3p7IBeSGQu07efXqrAwsGHbEkuXz69dkwJBT4j5bbOqZJvmJixfp9L17acFdgwri6M4d/RNk0vumtureutWYCACLnrxyRf+Emb2EtQIyIJvQVbXOqWvX0hz598aNyutuP3yYrhsgkhNC+lQDeLwqUbO1llVSL6ePP7WFwAIdjWMUSPZlWNi1L87nrE9MzkL4swVsAtjQJIId3+9vkSH/PXgg7m72AVj2o7jL6k7rHIMa6//9/Vo2NI6IAmLU07nsDmaPmQ4Ghdc5ffeueLbg/KoKobQsHBE0UWLacLrcQQEhTnr61ogoP4RMaLMR5f+OhHBnMm0ynhfhw+e2CpqbG5snHRkIvzfr1t/UqEy6sktVdT60sQ9Lh7FaUUIwNrFx9uIHYRoA0USBvfgJD3sFuhfJtmzRXM9upxfXaDTm3zQNiLqZnvpvbS3PC2WHtRZ4bVWod45lVHU2oJ1lyDi7MddlylE5JINeRrz2QoThi9ACH589Ey9pRVEtIeblp15m/DHf+sVoVEiafHr1SixrIOrlBlHzfb/o6W590nOSh/l9c0KkyhG1m3G3YDiuaMSq1VEpigZYENLyqBRGA5SNIbYyKmXRAIVCWhqV0miAZaO6rYrKsmiAUiEti8rSaICqCQOISkzrJa6KBlgqREYlpPUy6mpM49Cai8JtsHVM4QAx38zzOgdWzkURoGW8HkLdA7WEyNHTVSe+0WQ0vYjMwDyQVVXHU50Ez6ItZMWJr5XgWYynAq4g8bUTPIuJtRQ3qUHYUgHVwFgI362YmrOYsaUUdSICmnjixzSrUGpRS4hIfM8bklvCnsVk5roRcf1ssZ7AXFuIBFaIyY7Y9JlRhJUQRxYL6yZ4FtuI2FrM2lIKayGSOhZzYimFEyE1LebEUgpXETG1mDNLKZwJkehYzKmlFE6FaFrMqaUUriNSZTHnllI4FwK4sJjLlx+5acRSikaECGYWy7adbjZhKUVjQthiGL8P5Sb+1SiiTQYzvIsm5bvmK6QD2syhqkIbAAAAAElFTkSuQmCC';
  const COORD_PRECISION = 5; // 좌표 비교 정밀도 (소수점 5자리 약 1.1m)

  if (!webViewRef.current) return;

  const script = `
    (function() {
      try {
        // 1. 기존 마커 제거 및 전역 마커 저장소 초기화
        if (window.mapStoreMarkers) {
          window.mapStoreMarkers.forEach(m => {
            if (m && m.marker && typeof m.marker.setMap === 'function') {
              m.marker.setMap(null);
            }
          });
        }
        window.mapStoreMarkers = []; // { marker: KakaoMarker, representativeStoreData: obj, associatedBrandIds: Set<number>, associatedStoreIds: Set<string> }

        const brandStoresArray = ${JSON.stringify(brandStores)};
        const currentSelectedBrandId = ${selectedBrandId === null || selectedBrandId === undefined ? 'null' : Number(selectedBrandId)};

        // 2. 매장 ID 기준으로 데이터 정제: uniqueStoresById Map 생성
        // Key: store.id, Value: { storeData: 최초 발견된 store 객체, brandIds: 이 store ID에 연결된 모든 brand ID Set }
        const uniqueStoresById = new Map();
        brandStoresArray.forEach(brandData => {
          const currentBrandIdNum = Number(brandData.brandId);
          if (brandData.stores && Array.isArray(brandData.stores)) {
            brandData.stores.forEach(store => {
              if (store && store.id && store.y && store.x) { // id 및 좌표 유효성 검사
                const storeId = store.id.toString(); // API 응답에 따라 id가 숫자일 수 있으므로 문자열로 통일
                if (!uniqueStoresById.has(storeId)) {
                  uniqueStoresById.set(storeId, { storeData: store, brandIds: new Set() });
                }
                uniqueStoresById.get(storeId).brandIds.add(currentBrandIdNum);
              }
            });
          }
        });

        // 3. 정제된 매장들(uniqueStoresById)을 기반으로 고유 좌표별 마커 정보 집계: uniqueCoordinatesMap 생성
        // Key: 'lat_lng', Value: { representativeStoreData: 해당 좌표의 대표 매장 정보,
        //                         brandIdsAtCoord: 해당 좌표에 있는 모든 브랜드 ID Set,
        //                         storeIdsAtCoord: 해당 좌표에 있는 모든 매장 ID Set }
        const uniqueCoordinatesMap = new Map();
        uniqueStoresById.forEach(value => { // value는 { storeData, brandIds }
          const { storeData, brandIds: brandIdsForThisStore } = value; // brandIdsForThisStore는 이 특정 store.id에 연결된 브랜드 ID들
          const lat = parseFloat(storeData.y);
          const lng = parseFloat(storeData.x);
          if (isNaN(lat) || isNaN(lng)) return;

          const coordKey = lat.toFixed(${COORD_PRECISION}) + '_' + lng.toFixed(${COORD_PRECISION});

          if (!uniqueCoordinatesMap.has(coordKey)) {
            uniqueCoordinatesMap.set(coordKey, {
              representativeStoreData: storeData, // 이 좌표의 대표 매장 (uniqueStoresById에서 처음 등장한 storeData)
              brandIdsAtCoord: new Set(),
              storeIdsAtCoord: new Set()
            });
          }
          // 현재 store에 연결된 모든 브랜드 ID들을 이 좌표의 brandIdsAtCoord에 추가
          brandIdsForThisStore.forEach(brandId => uniqueCoordinatesMap.get(coordKey).brandIdsAtCoord.add(brandId));
          uniqueCoordinatesMap.get(coordKey).storeIdsAtCoord.add(storeData.id.toString());
        });

        // 4. uniqueCoordinatesMap 기준으로 고유 좌표별 하나의 마커 생성
        uniqueCoordinatesMap.forEach((value, coordKey) => {
          const { representativeStoreData, brandIdsAtCoord, storeIdsAtCoord } = value;
          const marker = new kakao.maps.Marker({
            position: new kakao.maps.LatLng(representativeStoreData.y, representativeStoreData.x),
            title: representativeStoreData.place_name,
            image: new kakao.maps.MarkerImage(
              '${markerImageBase64}',
              new kakao.maps.Size(24, 35)
            )
          });

          kakao.maps.event.addListener(marker, 'click', function() {
            let clickedBrandIdToSend = null;
            // 클릭된 마커의 좌표에 여러 브랜드가 있을 수 있음 (brandIdsAtCoord)
            // 현재 선택된 브랜드(currentSelectedBrandId)가 이 마커의 브랜드들(brandIdsAtCoord)에 포함되어 있다면,
            // 그 currentSelectedBrandId를 우선적으로 사용한다.
            // 그렇지 않다면, 이 마커와 연관된 브랜드들 중 첫 번째 것을 사용한다.
            if (brandIdsAtCoord.size > 0) {
              if (currentSelectedBrandId !== null && brandIdsAtCoord.has(currentSelectedBrandId)) {
                clickedBrandIdToSend = currentSelectedBrandId;
              } else {
                clickedBrandIdToSend = brandIdsAtCoord.values().next().value;
              }
            }
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'markerClick',
              store: representativeStoreData, // 대표 매장 정보
              brandId: clickedBrandIdToSend, // 클릭 시 선택될 브랜드 ID
              associatedBrandIdsOnMarker: Array.from(brandIdsAtCoord), // 이 마커(좌표)에 연결된 모든 브랜드 ID
              associatedStoreIdsOnMarker: Array.from(storeIdsAtCoord) // 이 마커(좌표)에 연결된 모든 매장 ID
            }));
          });

          // window.mapStoreMarkers에 associatedBrandIds로 brandIdsAtCoord 저장
          window.mapStoreMarkers.push({
            marker: marker,
            representativeStoreData: representativeStoreData,
            associatedBrandIds: brandIdsAtCoord, // 이 마커(좌표)에 연관된 모든 브랜드 ID Set
            associatedStoreIds: storeIdsAtCoord   // 이 마커(좌표)에 연관된 모든 매장 ID Set
          });
        });

        // 5. 생성된 모든 고유 마커들에 대해 현재 선택된 브랜드에 따라 표시 여부 결정
        window.mapStoreMarkers.forEach(markerData => {
          // currentSelectedBrandId가 null (전체보기) 이거나,
          // markerData의 associatedBrandIds (해당 마커 좌표에 있는 모든 브랜드 Set) 가 currentSelectedBrandId를 포함하면 표시
          if (currentSelectedBrandId === null || markerData.associatedBrandIds.has(currentSelectedBrandId)) {
            markerData.marker.setMap(map);
          } else {
            markerData.marker.setMap(null);
          }
        });

        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'markersUpdated',
          message: \`총 \${window.mapStoreMarkers.length}개의 고유 좌표 마커 업데이트됨. (uniqueStoresById: \${uniqueStoresById.size})\`
        }));

      } catch (error) {
        console.error('마커 업데이트 중 오류:', error);
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'error',
          message: '마커 업데이트 오류: ' + error.message + ' Stack: ' + error.stack
        }));
      }
    })();
    true;
  `;

  webViewRef.current.injectJavaScript(script);
};

// 선택된 브랜드에 따라 마커 필터링
export const filterMarkersByBrand = (webViewRef, selectedBrandId) => {
  if (!webViewRef.current) return;

  const script = `
    (function() {
      try {
        const currentSelectedBrandId = ${selectedBrandId === null ? 'null' : Number(selectedBrandId)};

        if (!window.mapStoreMarkers) {
          console.warn('mapStoreMarkers가 초기화되지 않았습니다. 필터링을 건너뜁니다.');
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'filterError', message: 'mapStoreMarkers not initialized' }));
          return;
        }

        let visibleMarkerCount = 0;
        window.mapStoreMarkers.forEach(markerData => {
          if (markerData && markerData.marker && typeof markerData.marker.setMap === 'function' && markerData.associatedBrandIds) {
            if (currentSelectedBrandId === null || markerData.associatedBrandIds.has(currentSelectedBrandId)) {
              markerData.marker.setMap(map);
              visibleMarkerCount++;
            } else {
              markerData.marker.setMap(null);
            }
          }
        });

        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'filterComplete',
          selectedBrandId: currentSelectedBrandId,
          visibleMarkerCount: visibleMarkerCount,
          totalTrackedMarkers: window.mapStoreMarkers.length,
          message: '마커 필터링 완료'
        }));

      } catch (error) {
        console.error('필터링 중 오류:', error);
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'error',
          message: '필터링 오류: ' + error.message + ' Stack: ' + error.stack
        }));
      }
    })();
    true;
  `;

  webViewRef.current.injectJavaScript(script);
};
