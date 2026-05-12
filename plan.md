## 피그마 Row Data로 이벤트 페이지 구축하기 준비

- 시안은 PC, TB ,MB 의 3시안
  - PC : https://www.figma.com/design/ilCLRjyByTdXm5GOMtVXGN/VESSL-AI?node-id=301-1658&m=dev
  - TB : https://www.figma.com/design/ilCLRjyByTdXm5GOMtVXGN/VESSL-AI?node-id=195-1374&m=dev
  - MB : https://www.figma.com/design/ilCLRjyByTdXm5GOMtVXGN/VESSL-AI?node-id=195-1373&m=dev
- parse_figma.mjs 를 통해 섹션별로 나눔
- 이미지는 https://www.figma.com/design/ilCLRjyByTdXm5GOMtVXGN/VESSL-AI?node-id=183-3577&m=dev 에 모여있음 폴더에 일괄 다운로드 받으면 됨 
- 추후 플랜
  - 현 프로젝트가 아닌 다른 프로젝트에서 해당 데이터들을 가지고 반응형 페이지를 구축할 예정 (이미지도 Row데이터를 보고 연결하고 잘 안맞는건 수동으로 조정)
  - 현 방식에서 개선포인트가 있다면 제안 요청 (파일을 쪼갠 계기는 한 덩어리 데이터는 수정이나 생성에 너무 많은 토큰을 소비해서 조각내었음)