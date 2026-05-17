2025-08-11
标题：PhysTwin: Physics-Informed Reconstruction and Simulation of  Deformable Objects from Videos

摘要：为真实物体创建物理数字孪生体在机器人学、内容创作及扩展现实领域具有巨大潜力。本文提出PhysTwin新型框架，通过动态物体在交互过程中的稀疏视频，生成具备照片级及物理真实感、可实时交互的虚拟复制体。其核心包含两大创新：(1) 基于物理定律的表征方式，融合弹簧-质量模型实现真实物理模拟、生成式几何模型构建形状结构、高斯溅射技术实现渲染；(2) 全新多阶段优化逆向建模框架，从视频中重构完整几何结构、推断致密物理属性并复现真实外观。该方法将逆向物理框架与视觉感知线索相结合，能在部分遮挡及视角受限条件下仍实现高保真重建。PhysTwin支持对绳索、毛绒玩具、布料及快递包裹等多种可变形物体的建模。实验表明，该系统在重建精度、渲染质量、未来状态预测及新型交互下仿真等方面均超越现有方法。我们进一步演示了其在实时交互仿真与基于模型的机器人运动规划中的应用。项目主页：https://jianghanxiao.github.io/phystwin-web/

# 弹簧质点模型

我们回顾一下弹簧质点模型 (Spring-Mass Model)，这个模型在[[Spring-Gaus]]中同样有介绍，在此再简述一下其原理。

弹簧质点模型是指将可变形物体简单视作质点与弹簧的组合，形成一个图结构$\mathcal{G}=(\mathcal{V}, \mathcal{E})$ ，其中$\mathcal{V}$指质点集合，$\mathcal{E}$指弹簧集合，每个质点$i$有位置$x_i$和速度$v_i$，可通过牛顿力学随时间更新，质点所受力由下面的公式计算得出：

$$

\tag{1}

\mathbf{F}_i=\sum_{(i, j) \in \mathcal{E}} \mathbf{F}_{i, j}^{\text {spring }}+\mathbf{F}_{i, j}^{\text {dashpot }}+\mathbf{F}_i^{\text {ext }}

$$

其中$\mathbf{F}^{\mathrm{spring}}_{i,j}$指节点$i, j$间的弹簧弹力，$\mathbf{F}^{\mathrm{dashpot}}_{i,j}$是指节点$i, j$之间的阻尼力，$\mathbf{F}^{\mathrm{ext}}_i$是指所受外力。前两者展开为

$$

\tag{2}

\begin{align}

\mathbf{F}^{\mathrm{spring}}_{i,j} &= k_{ij}(\Vert x_j - x_i\Vert - l_{ij})\frac{x_j - x_i}{\Vert x_j - x_i \Vert}\\

\mathbf{F}^{\mathrm{dashpot}}_{i,j}&=-\gamma(v_i - v_j)

\end{align}

$$

其中$k_{ij}$是弹簧刚度，$l_{ij}$是静止长度，$\gamma$是阻尼因子。

  

处理碰撞，包括物体与碰撞体以及两个物体质点之间的碰撞，文章采用基于冲量的碰撞处理策略。

  

进行位置和速度的更新时，文章采取半隐式欧拉法，即对任意节点$i$，$\mathbf{v}_i^{t+1}=\delta\left(\mathbf{v}_i^t+\Delta t \frac{\mathbf{F}_i}{m_i}\right)$$\quad \mathbf{x}_i^{t+1}=\mathbf{x}_i^t+\Delta t \mathbf{v}_i^{t+1}$。其中$\delta$是阻尼系数。

  

# Overview

![[Pasted image 20250807161758.png]]

为优化PhysTwin系统，我们同步最小化渲染损失与模拟几何/运动同实际观测的差异。其中渲染损失函数用于优化高斯核，而几何损失与运动损失则共同优化PhysTwin的整体几何架构、拓扑关系及物理参数。
# 两阶段优化

Phystwin将优化过程分为两个阶段，其中第一个阶段专注于优化几何与物理相关的参数，第二个阶段则主要优化与外观相关的参数。

## 物理与几何优化
文章提出首先将相机获取的每帧深度图$D_t$转化为观测部分的3D点云$X_t$，在这一阶段，我们优化：

$$
\tag{3}
\begin{aligned} & \min_{\alpha, \mathcal{G}_0} \sum_t\left(C_{\text {geometry }}\left(\hat{\mathbf{X}}_t, \mathbf{X}_t\right)+C_{\text {motion }}\left(\hat{\mathbf{X}}_t, \mathbf{X}_t\right)\right) \\ & \text { s.t. } \quad \hat{\mathbf{X}}_{t+1}=f_{\alpha, \mathcal{G}_0}\left(\hat{\mathbf{X}}_t, a_t\right),\end{aligned}
$$
其中$C_\mathrm{geometry}$为推测的点云$\hat X_t$与观测点云$X_t$之间的[[Chamfer Distance（CD）| Chamfer Distance]]，$C_\mathrm{motion}$是预测点$\hat x_t$与观测点$x_t$之间的轨迹误差。其中观测轨迹通过CoTracker3获取2维轨迹，随后通过深度图投影到3维空间中。
<font color="#c00000">Q：推测点云$\hat X_t$与观测点云$X_t$并不是一一对应的，该如何找到预测点$x_t$对应的观测点$x_t$？</font>

在第一阶段的优化中会面临以下问题：

* 观测角度稀疏，只能得到部分点云
* 需要同时优化物理参数和几何参数
* 动态模型中存在不连续性，再加上长时间跨度和密集的参数空间，这些因素共同导致了连续优化变得非常困难。

为解决这些问题，文章提出将几何参数与其他参数分开来处理。
### Generative Shape Prior
由于观测角度有限，我们很难获得完整几何，于是文章利用生成式图生3D模型TRELLIS，从单张RGB观测中生成完整的网格模型，由此得到物理先验。为提升网格质量，输入的RGB图片首先用超分模型（super-resolution model）对经由Grounded-SAM2获取的前景部分进行超分。然而，即使得到的网格模型很好地与相机观测吻合，我们仍可观察到尺度、姿态和形变方面的不一致性。

为此，文章加入一个配准模块，采用二维匹配进行尺度估计、刚性配准及非刚性形变。首先使用SuperGlue，在围绕物体均匀分布的相机中，选择匹配到点数量最多的相机，以此作为粗略的旋转估计。之后采用PnP算法对旋转进行细致配准，并优化参考系中匹配点之间的距离来配准缩放与平移向量，这里的参考系选用相机参考系，因为PnP配准后，相匹配的点在过原点的同一条射线上，因此只需要优化缩放即可。对齐姿态后，形变部分通过ARAP (as-rigid-as-possible)配准。最后，光线投射对齐确保了观测点与变形网格在无遮挡情况下的匹配。
### Sparse-to-Dense Optimization
弹簧质点模型包括两个重要属性：拓扑结构（如弹簧连接情况）与弹簧的物理属性。

就拓扑结构而言，为实现外界交互，模型包括控制点，用于模拟手的拉动，它通过控制弹簧与物体连接起来，连接情况由半径（用于控制连接多大范围的点）与最大连接数决定。通过拉动控制点，就能带动控制弹簧，引起物体形变。物体内部的拓扑结构采用类似的方法，采用半径与最大连接数控制弹簧密度，

为从视频中获取控制点，文章利用Grounded-SAM2得到手部mask，并用CoTracker3得到手部运动轨迹，将控制点提升到3D空间后，采用[[Farthest Point Sampling（FPS）|FPS（farthest-point sampling）]]采样获得最终的控制点集合。

在优化过程中面临两个挑战：
* 部分参数不可微，如半径与最大连接数；
* 弹簧数目极多，需要优化大量刚度参数。

于是文章采用sparse-to-dense优化策略，首先采用基于采样的零阶优化策略，由于零阶优化不适合优化庞大的参数空间，于是作者在第一阶段假设所有的刚度一致，主要优化不可微的物理和拓扑参数。在第二阶段进一步采用一阶梯度下降法优化参数，利用自行开发的可微分弹簧-质点模拟器，同步优化密集弹簧刚度与碰撞参数。
![[Pasted image 20250811175123.png]]
## 外观优化
物体外观通过3DGS表示，优化下面的损失函数：
$$
\tag{4}
\min_\theta \sum_{t, i} C_{\text {render }}\left(\hat{\mathbf{I}}_{i, t}, \mathbf{I}_{i, t}\right) \\
s.t. \hat{\mathbf{I}}_{i, t}=g_\theta\left(\hat{\mathbf{X}}_t, i\right)
$$
其中$\hat {\mathbf{I}}_{i,t}$和$\mathbf{I}_{i,t}$是渲染图片与真实图片，$C_\mathrm{render}$为两图片的$L_1$ loss和D-SSIM。

简单起见，模型只优化第一帧的外观，并强制高斯粒子为各向同性，避免形变时产生尖锐伪影。
### 更新高斯粒子
给定前一状态$\hat X_t$和预测状态$\hat X_{t+1}$，首先求解每个质点$\hat{\mu}_i^t \in \hat X_t$所需的变换，对于平移向量$T_i^t$，直接用质点预测位置与原始位置相减，对于旋转矩阵，用下面的公式估计其局部旋转：
$$
\tag{5}
R_i^t=\arg \min_{R \in S O(3)} \sum_{j \in \mathcal{N}(i)}\left\|R\left(\hat{\mu}_j^t-\hat{\mu}_i^t\right)-\left(\hat{\mu}_j^{t+1}-\hat{\mu}_i^{t+1}\right)\right\|^2
$$
也就是对于每一个质点 $i$，观察它和它周围邻居 $j$在当前时刻 $t$形成的局部形状。然后，再观察它们在下一时刻 $t+1$ 形成的新形状。寻找一个最佳的旋转矩阵 $R$，使得旧的局部形状经过这个旋转后，能和新的局部形状尽最大可能地重合 。

之后采用Linear Blend Skinning (LBS)，将质点变化量插值为高斯粒子的变化：
$$
\tag{6}
\begin{aligned} \mu_j^{t+1}= & \sum_{k \in \mathcal{N}(j)} w_{j k}^t\left(R_k^t\left(\mu_j^t-\hat{\mu}_k^t\right)+\hat{\mu}_k^t+T_k^t\right) \\ & q_j^{t+1}=\left(\sum_{k \in \mathcal{N}(j)} w_{j k}^t r_k^t\right) \otimes q_j^t\end{aligned}
$$
其中$R^t_k$和$q^t_j$分别是矩阵形式和四元数形式的旋转变换，$\otimes$表示四元数乘法，$\mathcal{N}(j)$表示$\mu$的K近邻点。$w^t_{jk}$表示插值权重。
$$
\tag{7}
w_{j k}^t=\frac{\left\|\mu_j^t-\hat{\mu}_k\right\|^{-1}}{\sum_{k \in \mathcal{N}(j)}\left\|\mu_j^t-\hat{\mu}_k\right\|^{-1}}
$$