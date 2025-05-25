//撮影画面
import { useNavigate } from "react-router-dom";
import { CameraFrames } from "./face_crop";
// import CameraFrame from "./face_crop";

function Camera() {
  const navigate = useNavigate();

  const gotoChange = () => {
    navigate("/photo_change");
  };

  return (
    <>
      <h1>カメラぱしゃ</h1>
      <button onClick={gotoChange}>スーツチェンジ</button>
      <CameraFrames />
    </>
  );
}

export default Camera;
