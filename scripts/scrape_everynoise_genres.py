import requests
from bs4 import BeautifulSoup
import re
import pandas as pd
import os

def parse_everynoise_genres():
    url = "https://everynoise.com/"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    print("Every Noise at Once 데이터 수집을 시작합니다...")
    try:
        response = requests.get(url, headers=headers, timeout=30)
    except Exception as e:
        print(f"❌ 네트워크 접속 에러: {e}")
        return
        
    if response.status_code != 200:
        print(f"❌ 페이지 접속 실패: {response.status_code}")
        return
        
    soup = BeautifulSoup(response.text, "html.parser")
    # 장르 데이터가 담긴 div 태그 검색
    genre_divs = soup.find_all("div", class_=lambda x: x and "genre" in x)
    
    genre_list = []
    
    for div in genre_divs:
        # '»' 기호 제거 및 장르 이름 정제
        genre_name = div.text.replace("»", "").strip()
        
        # HTML 인라인 스타일에서 위치 좌표(top, left) 추출
        style_attr = div.get("style", "")
        top_match = re.search(r"top:\s*(\d+)px", style_attr)
        left_match = re.search(r"left:\s*(\d+)px", style_attr)
        
        top_val = int(top_match.group(1)) if top_match else None
        left_val = int(left_match.group(1)) if left_match else None
        
        # Every Noise 특유의 좌표 기반 무드 맵핑 알고리즘 적용
        # 상단=하이퍼/전자음, 하단=차분함/딥, 좌측=유기적/어쿠스틱, 우측=인공적/일렉트로닉
        mood_tag = "Unknown"
        if top_val is not None and left_val is not None:
            if top_val < 400 and left_val > 700:
                mood_tag = "Hyper/Electronic"
            elif top_val > 600 and left_val < 400:
                mood_tag = "Deep/Acoustic"
            elif top_val < 400:
                mood_tag = "Energetic"
            elif top_val > 600:
                mood_tag = "Atmospheric/Calm"
                
        genre_list.append({
            "genre_name": genre_name,
            "coordinate_top": top_val,
            "coordinate_left": left_val,
            "estimated_mood": mood_tag
        })
        
    # 데이터프레임 변환 및 CSV 저장
    df = pd.DataFrame(genre_list)
    
    # 저장 경로를 스크립트 위치 기준으로 설정
    current_dir = os.path.dirname(os.path.abspath(__file__))
    output_file = os.path.join(current_dir, "global_music_genres.csv")
    
    df.to_csv(output_file, index=False, encoding="utf-8-sig")
    print(f"✅ 수집 완료! 총 {len(df)}개의 장르 데이터가 '{output_file}'로 저장되었습니다.")

if __name__ == "__main__":
    parse_everynoise_genres()
