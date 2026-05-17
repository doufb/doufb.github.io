2025-08-07
标题：Reconstruction and Simulation of Elastic Objects  with Spring-Mass 3D Gaussians
**ECCV 2024**

摘要：基于视觉观测重建和模拟弹性物体对于计算机视觉与机器人技术应用至关重要。现有方法（如3D高斯模型）虽能建模三维外观与几何形态，但无法估算物体物理属性并进行动态模拟。核心挑战在于如何整合兼具表现力与效率的物理动力学模型。我们提出Spring-Gaus——一种基于多视角视频的弹性物体三维物理表征方法，通过将3D弹簧质点模型与3D高斯核相结合，实现了物体视觉外观、几何形态及物理动态特性的联合重建。该方法支持在不同初始状态与环境属性下进行未来状态预测与动态模拟。我们在合成与真实数据集上验证了Spring-Gaus，结果证实其对弹性物体具有精确重建与仿真能力。项目页面：https://zlicheng.com/spring_gaus。
# Overview
![[Pasted image 20250804194224.png]]
![[Pasted image 20250804171711.png]]
这篇工作把3DGS与弹簧质点模型结合，主要分为三步：


* 第一个阶段与传统3DGS一致，是从多视角的图片中重建静态高斯粒子。
* 第二个阶段通过体采样（Volume Sampling)，将静态的高斯粒子采样成一些锚点（Anchor Points），当然如果反过来，从锚点同样能通过插值回到高斯粒子。
* 最后一个阶段是从已知的视频中优化基于锚点的Spring-Mass模型参数，从而实现合理的物理仿真。
# 弹簧-质点模型
由于静态重建部分与原始3DGS方法（参见[[report.pdf]]的3DGS部分）没有区别，在此不再赘述，我们直接进入弹簧-质点模型的介绍。
## 构建锚点

弹簧质点模型假设系统仅由质点和连在质点间的弹簧组成，用弹簧与质点的运动来模拟真实运动。若已由静态重建得到3DGS场景$\left\{G_i\right\}_{i=1}^N$，只考虑粒子位置的话变为$\boldsymbol{X}=\left\{\boldsymbol{\mu}_i\right\}_{i=1}^N$，因为高斯粒子的数目N极多，不适用作为模拟运动所需的质点，因此文章采用体采样方法从高斯场景中得到物理仿真所使用的锚点：
$$
\tag{1}
\boldsymbol{A}=\left\{\boldsymbol{x}_i\right\}_{i=1}^{N_A}=\mathcal{V}(\boldsymbol{X})
$$
其中$N_A$表示锚点数量，$\mathcal{V}$表示体采样函数。

关于$\mathcal{V}$，文章对应的代码中有相关函数：

```python
def uniform_sampling(cloud_points, voxel_size):
    scaled_points = cloud_points / voxel_size
    scaled_points = torch.floor(scaled_points).int() + 0.5
  
    uniform_grid = torch.unique(scaled_points, dim=0)
    uniform_cloud = uniform_grid * voxel_size

    return uniform_cloud
```
也就是将网格中的点采样到网格中心。

## 构建弹簧


有了质点，接下来便要构建连在质点间的弹簧，我们当然没必要将每两个质点都用弹簧连起来，基于一个很自然的假设——质点更多地受与它距离近的质点影响。一个简单的想法是将质点与它相距距离最近的$n_k$个质点相连：
$$
\tag{2}
\boldsymbol{L} = \{l_{i, j}\}^{N_A, n_k}_{i=1,j=1} = \mathrm{knn}(\boldsymbol{A}, \boldsymbol{A}, n_k)
$$
其中$l_{i, j}$表示$x_i$与$x_j$间的距离，$\mathrm{knn}$表示k近邻函数 (the k-nearest neighbors function)，每个弹簧都有自己各自的刚度$k_{i, j}$和阻尼因子$\zeta_{i,j}$。

## 动力学计算


有了这个模型，就能通过简单的力学计算，在每个timestep计算各个锚点所受的力：
$$
\tag{3}
\boldsymbol{F}_i^t=\boldsymbol{F}_{\boldsymbol{k}_i}^i+\boldsymbol{F}_{\zeta_i}^t+m_i \boldsymbol{g}
$$
其中等式右边的三个力分别代表弹簧弹力，阻尼力和重力。

弹簧弹力与阻尼力展开后为：
$$
\tag{4}
\boldsymbol{F}_{\boldsymbol{k}_{i, j}}^t=-\eta_j \cdot k_{i, j}\left(\left\|\boldsymbol{x}_i^t-\boldsymbol{x}_{i, j}^t\right\|-l_{i, j}\right) \frac{\boldsymbol{x}_i^t-\boldsymbol{x}_{i, j}^t}{\left\|\boldsymbol{x}_i^t-\boldsymbol{x}_{i, j}^t\right\|} \cdot\left|\left\|\boldsymbol{x}_i^t-\boldsymbol{x}_{i, j}^t\right\|-l_{i, j}\right|^{p_k},
$$
$$
\tag{5}
\boldsymbol{F}_{\zeta_{i, j}^t}^t=\left(-\zeta_{i, j}\left(\boldsymbol{v}_i^t-\boldsymbol{v}_{i, j}^t\right) \frac{\boldsymbol{x}_i^t-\boldsymbol{x}_{i, j}^t}{\left\|\boldsymbol{x}_i^t-\boldsymbol{x}_{i, j}^t\right\|}\right) \cdot \frac{\boldsymbol{x}_i^t-\boldsymbol{x}_{i, j}^t}{\left\|\boldsymbol{x}_i^t-\boldsymbol{x}_{i, j}^t\right\|}
$$

其中$\eta$是一个向量，具体稍后会说，而$p_k$是一个超参，用于决定弹簧力的非线性程度，当$p_k =  0$时，上面第一个公式就会变成胡克定律，否则将是一个非线性的方程。

最后作用到每个锚点$x_i^t$上的合力是：
$$
\tag{6}
\boldsymbol{F}_i^t=\sum_{j=1}^{n_k} \boldsymbol{F}_{\boldsymbol{k}_{i, j}}^t+\sum_{j=1}^{n_k} \boldsymbol{F}_{\boldsymbol{\zeta}_{i, j}}^t+m_i \boldsymbol{g}
$$
之后采用半隐式欧拉法更新锚点的位置和速度：
$$
\tag{7}
\begin{aligned} \hat{\boldsymbol{v}}_i^{t+1} & =\boldsymbol{v}_i^t+\frac{\boldsymbol{F}_i^t}{m_i} \Delta t, \\ \hat{\boldsymbol{x}}_i^{t+1} & =\boldsymbol{x}_i^t+\boldsymbol{v}_i^{t+1} \Delta t,\end{aligned}
$$
为与环境互动，还会有边界条件$\mathcal{B}$作用到锚点上：
$$
\tag{8}
\boldsymbol{x}_i^{t+1}, \boldsymbol{v}_i^{t+1}=\mathcal{B}\left(\hat{\boldsymbol{x}}_i^{t+1}, \hat{\boldsymbol{v}}_i^{t+1}\right)
$$
## 插值更新高斯

最后通过Inverse Distance Weighting (IDW)插值将锚点的位置和速度更新到高斯粒子上：
$$
\tag{9}
\boldsymbol{\mu}_i^{t+1}=\frac{\sum_{j=1}^{n_b} \boldsymbol{x}_{i, j}^{t+1} \cdot\left(1/\left(d_{i, j}\right)^{p_b}\right)}{\sum_{j=1}^{n_b}\left(1/\left(d_{i, j}\right)^{p_b}\right)}
$$
其中$d_{i, j}$会在最开始时初始化：
$$
\tag{10}\left\{d_{i, j}\right\}_{i=1, j=1}^{N, n_b}=\operatorname{knn}\left(\boldsymbol{X}, \boldsymbol{A}, n_b\right)
$$
$p_b$是一个衡量锚点影响力随距离衰减程度的实数。

## 软向量
回顾前面的$n_k$，它可以用于控制连接锚点的弹簧数，作者实验发现，$n_k$的变化会显著影响仿真的结果。因此论文提出使用软向量(soft vector)$\eta=\left[\eta_0, \eta_1, \ldots, \eta_{n_k}\right]$来缓解这一问题，这一向量由一个由全部锚点共享的可学习参数$\kappa$控制，从公式(4)可以看出，这一向量用于调整不同弹簧的权重，具体形式如下：
$$
\tag{11}
\eta_j= \begin{cases}1& j \leq n_c \\ \operatorname{clamp}\left(2-\exp (\operatorname{softplus}(\kappa))^{j-n_c},0,1\right) & n_c<j \leq n_k\end{cases}
$$
其中$n_c$是一个预先设定的经验参数。

![[Pasted image 20250806115600.png]]从文章给出的消融实验来看，软向量确实能明显改善仿真结果。
# 优化
## 减少参数量

为减少需要优化的参数量，以提升模型性能，文章采取若干措施：

* 将每个锚点的质量统一设为$m_0$
* 所有的阻尼因子设为$\zeta_0$
* 对每个锚点引入参数$k_i$，用于控制连在其上面弹簧的刚度，将所需优化的参数数目从$N_A \cdot n_k$降到了$N_A$。

弹簧刚度$k_{i, j}$和阻尼系数$\zeta_{i, j}$计算如下：
$$
\tag{12}
k_{i,j} = k_i/l_{i,j},
$$
$$
\tag{13}
\zeta_{i,j} = \zeta_0/l_{i,j}.
$$
## coarse-to-fine策略

优化过程中，两关键帧之间存在$n_t$个timestep，在每个timestep，通过公式(7)更新$x_t$，物理参数的优化仅在每个关键帧执行，随着物理参数逐渐收敛，$n_t$的值逐渐升高，以达到更精确的仿真结果。这种coarse-to-fine的策略能有效平衡准确性与算力需求。

## 3D Gaussians精调

在动态模拟时，高斯的中心通过公式（9）插值更新，这会导致与静态重建的结果相比产生外观的偏移。因此在动态模拟开始前，文章提出对首帧高斯的非位置参数：缩放标量$s$， 颜色向量$c$和透明度$\sigma$进行优化，使得具有插值空间位置的高斯核能渲染出正确的外观。具体流程如下：
```python
def refine_step(args, cfg, cfg_stage, stage, simulator, scene: Scene, gaussians: GaussianModel_isotropic):
    viewpoint_stack = None
    ema_loss_for_log = 0.0

    background = torch.tensor(scene.dataset.bg, dtype=torch.float32, device="cuda")

    xyz = simulator.init_xyz.detach().clone()
    xyz_all = torch.sum(xyz[simulator.intrp_index] * simulator.intrp_coef.unsqueeze(-1), dim=1)
    gaussians._xyz = xyz_all
    
    train_bar = etqdm(range(1, cfg_stage.ITER_REFINE + 1))
    for iteration in train_bar:
	    ...
```

值得注意的是，作者在附录中提到在静态场景重建阶段对所有的高斯保持恒定的缩放因子$s_0$，并指出该措施能使点云和锚点分布更加均匀，令高斯核函数空间分布更加均衡，提升动态模型的模拟能力。而在精调阶段，则不会将缩放因子保持为常数，而是为每个高斯核指定各自的缩放$s_i$.

# 细节
## 初始点云

在进行静态重建时，初始的稀疏点云会影响最后的重建结果，若用SfM重建的点云作为初始点云，则最后高斯粒子大多会集中在物体表面。文章在立方体内初始化大量离散点，以此作为初始点云，使最后的高斯粒子的位置分布更均匀。
## 动静态场景校准

![[Pasted image 20250806162006.png]]
文章在真实数据集中采取了静态场景和动态场景分开处理的方案，采集静态场景时，将物体置于桌子上，拍摄50-70张不同角度的图片。动态场景则是将物体置于棋盘格中，拍摄三段不同角度的视频。静态场景可直接通过原本的3DGS方法进行建模，动态场景由于拍摄角度稀疏（仅3个角度），不足以进行有效的3DGS建模。因此，在动态建模之前，文章提出先将动静态场景对齐，优化缩放因子$s_r$、平移向量$t_r$和旋转向量$r_r$，这个旋转向量是6维的，以更好适应梯度优化。

由于物体的微小形变、光照、色差等现实原因，文章在模型中加入了掩码的中心损失和感知损失以更好对齐：
$$
\mathcal{L}=\left(1-\lambda_{\mathrm{d}-\mathrm{ssim}}\right) \mathcal{L}_1+\lambda_{\mathrm{d}-\mathrm{ssim}} \mathcal{L}_{\mathrm{d}-\mathrm{ssim}}+\lambda_{\text {center }} \mathcal{L}_{\text {center }}+\lambda_{\text {percep }} \mathcal{L}_{\text {percep }}
$$
