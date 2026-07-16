// 피그마 메인 스레드에서 Iframe UI의 메세지를 수신받아 캔버스에 최적화된 이미지를 주입 및 렌더링하는 실행 스크립트입니다.

// 플러그인 UI 창을 생성하고 크기를 지정합니다.
figma.showUI(__html__, { width: 500, height: 750, themeColors: true });

// UI 영역(ui.html)으로부터의 메세지 리스너를 실행합니다.
figma.ui.onmessage = async (msg) => {
  if (msg.type === "optimized-image") {
    const { arrayBuffer, filename } = msg;

    try {
      // 1. 피그마용 이미지 객체 생성
      const image = figma.createImage(new Uint8Array(arrayBuffer));
      
      // 이미지의 본래 가로세로 해상도를 획득합니다.
      const size = await image.getSizeAsync();
      const aspect = size.width / size.height;

      // 2. 현재 선택된 노드가 있는지 검사
      const selection = figma.currentPage.selection;
      
      if (selection.length > 0) {
        // 선택된 노드들 중 사각형, 프레임 등 면(fill)을 가질 수 있는 노드를 찾아 이미지를 치환합니다.
        let replaced = false;
        for (const node of selection) {
          if ("fills" in node) {
            // 기존의 채우기 속성을 지우고 새 이미지로 덮어씌웁니다.
            node.fills = [
              {
                type: "IMAGE",
                imageHash: image.hash,
                scaleMode: "FILL",
              },
            ];
            replaced = true;
          }
        }

        if (replaced) {
          figma.notify("피그마 선택 레이어에 최적화 이미지를 성공적으로 교체하였습니다.");
          return;
        }
      }

      // 3. 선택된 노드가 없거나 채울 수 없는 경우, 신규 사각형 레이어를 만들어 중앙에 띄웁니다.
      const rect = figma.createRectangle();
      
      // 기본 크기는 400px 기준으로 가로세로비를 맞춰 배치합니다.
      const defaultWidth = 400;
      rect.resize(defaultWidth, defaultWidth / aspect);
      rect.name = filename;
      
      rect.fills = [
        {
          type: "IMAGE",
          imageHash: image.hash,
          scaleMode: "FILL",
        },
      ];

      // 캔버스 중앙 근처에 배치하고 화면 스크롤을 맞춰줍니다.
      rect.x = figma.viewport.center.x - rect.width / 2;
      rect.y = figma.viewport.center.y - rect.height / 2;
      
      figma.currentPage.appendChild(rect);
      
      // 신규 생성된 객체로 선택을 변경하고 줌인합니다.
      figma.currentPage.selection = [rect];
      figma.notify("피그마 캔버스에 최적화 이미지 노드를 신규 배치하였습니다.");

    } catch (error) {
      console.error("Figma image placement failed:", error);
      figma.notify("이미지를 피그마에 삽입하는 도중 에러가 발생하였습니다.", { error: true });
    }
  }
};
